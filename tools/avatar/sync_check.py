#!/usr/bin/env python3
"""
sync_check.py — estimate the lip-sync offset of a talking-avatar video (free, local, no API)
© 2026 motionforge contributors, MIT

Usage:
    python3 tools/avatar/sync_check.py renders/avatar.mp4 audio/voice.wav --mouth 0.42,0.68,0.16,0.08
    python3 tools/avatar/sync_check.py out/talk.mp4 out/talk.mp4          # use the video's own audio track
    python3 tools/avatar/sync_check.py video.mp4 voice.wav --json qa/sync.json

    --mouth x,y,w,h   the mouth region as fractions of the frame (left, top, width, height). Make it a
                      little larger than the open mouth. Without it the lower middle of the frame is used,
                      which works for a centred full-frame face and is weak for anything else.

Needs: ffmpeg on PATH, Python 3.10+, numpy.

How it works:
    1. ffmpeg crops the mouth region, converts it to grey, scales it to 48x24 px, 30 fps.
    2. Picture signal: how much darker the region got from one frame to the next (signed). An opening
       mouth shows the dark inside, so the region darkens as a syllable starts and brightens as it ends.
    3. Sound signal: RMS loudness per frame (window = one frame, centred on the frame time), and its
       signed change from one frame to the next (syllables starting and ending).
    4. Both are standardised and correlated at every lag from -300 to +300 ms (one frame steps); the
       strongest peak (by size: a face whose teeth dominate brightens instead) is refined to sub-frame
       accuracy with a parabola through its neighbours. Slow head movement barely changes the mean
       brightness of the region, so it hardly disturbs the measure.
    5. Result: offset in ms (+ = picture late, the mouth moves after the sound; - = picture early),
       the peak correlation, and a verdict: PASS when |offset| <= --max-ms (80) and corr >= --min-corr (0.3).

What it cannot tell you: whether the mouth SHAPES fit the sounds, or how it looks. Watch the result too.
A low correlation usually means the region misses the mouth, the face is small, or there is little speech.
Exit code: 0 PASS, 1 WARN, 2 error.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys

try:
    import numpy as np
except ImportError:  # pragma: no cover - message for the user
    sys.exit("sync_check: numpy is missing. Install it with: python3 -m pip install numpy")

FPS = 30.0
SR = 16000
CROP_W, CROP_H = 48, 24


def run(cmd: list[str]) -> bytes:
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode != 0:
        tail = proc.stderr.decode("utf-8", "replace").strip().splitlines()[-3:]
        raise RuntimeError("ffmpeg failed: " + " | ".join(tail))
    return proc.stdout


def mouth_motion(video: str, box: tuple[float, float, float, float]) -> np.ndarray:
    x, y, w, h = box
    vf = (f"fps={FPS},crop=iw*{w}:ih*{h}:iw*{x}:ih*{y},"
          f"scale={CROP_W}:{CROP_H}:flags=area,format=gray")
    raw = run(["ffmpeg", "-v", "error", "-i", video, "-an", "-vf", vf, "-f", "rawvideo", "-"])
    frames = np.frombuffer(raw, dtype=np.uint8).reshape(-1, CROP_H, CROP_W).astype(np.float32)
    if len(frames) < 10:
        raise RuntimeError("video too short (fewer than 10 frames)")
    darkness = -frames.mean(axis=(1, 2))
    return np.diff(darkness)                                       # change from frame i to i+1


def audio_change(audio: str, n_frames: int) -> np.ndarray:
    raw = run(["ffmpeg", "-v", "error", "-i", audio, "-vn", "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"])
    x = np.frombuffer(raw, dtype=np.float32)
    if x.size == 0:
        raise RuntimeError("no audio samples (does the file have an audio track?)")
    hop = SR / FPS
    rms = np.zeros(n_frames)
    for i in range(n_frames):
        c = int(round(i * hop))
        a, b = max(0, c - int(hop / 2)), min(x.size, c + int(hop / 2))
        if b > a:
            rms[i] = np.sqrt(np.mean(x[a:b] ** 2))
    return np.diff(rms)


def zscore(v: np.ndarray) -> np.ndarray:
    s = v.std()
    return (v - v.mean()) / s if s > 1e-9 else v * 0


def best_lag(pic: np.ndarray, snd: np.ndarray, max_lag: int) -> tuple[float, float, dict[int, float]]:
    """corr(lag) compares pic[i + lag] with snd[i]; a positive lag means the picture is late."""
    n = min(len(pic), len(snd))
    pic, snd = zscore(pic[:n]), zscore(snd[:n])
    corr = {}
    for lag in range(-max_lag, max_lag + 1):
        if lag >= 0:
            a, b = pic[lag:], snd[: n - lag]
        else:
            a, b = pic[: n + lag], snd[-lag:]
        corr[lag] = float(np.mean(a * b)) if len(a) > 5 else 0.0
    k = max(corr, key=lambda lag: abs(corr[lag]))
    frac = 0.0
    if -max_lag < k < max_lag:
        y0, y1, y2 = corr[k - 1], corr[k], corr[k + 1]
        den = y0 - 2 * y1 + y2
        if abs(den) > 1e-9:
            frac = max(-0.5, min(0.5, 0.5 * (y0 - y2) / den))
    return k + frac, abs(corr[k]), corr


def parse_box(text: str | None) -> tuple[float, float, float, float]:
    if not text:
        return (0.3, 0.55, 0.4, 0.3)
    parts = [float(p) for p in text.split(",")]
    if len(parts) != 4 or not all(0 <= p <= 1 for p in parts) or parts[2] <= 0 or parts[3] <= 0:
        raise ValueError("--mouth needs four fractions x,y,w,h between 0 and 1")
    if parts[0] + parts[2] > 1.0001 or parts[1] + parts[3] > 1.0001:
        raise ValueError("--mouth region goes past the frame edge")
    return tuple(parts)  # type: ignore[return-value]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Estimate the lip-sync offset between a video's mouth and a voice track.")
    ap.add_argument("video")
    ap.add_argument("audio", help="voice track (wav/mp3/...), or the same video to use its own audio")
    ap.add_argument("--mouth", help="mouth region x,y,w,h as fractions of the frame")
    ap.add_argument("--max-ms", type=float, default=80.0, help="largest offset that still passes (default 80)")
    ap.add_argument("--min-corr", type=float, default=0.3, help="lowest correlation that still passes (default 0.3)")
    ap.add_argument("--range-ms", type=float, default=300.0, help="search range (default +-300 ms)")
    ap.add_argument("--json", help="also write the result to this file")
    args = ap.parse_args(argv)

    if not shutil.which("ffmpeg"):
        print("sync_check: ffmpeg not found on PATH", file=sys.stderr)
        return 2
    try:
        box = parse_box(args.mouth)
        pic = mouth_motion(args.video, box)
        snd = audio_change(args.audio, len(pic) + 1)
    except (RuntimeError, ValueError) as err:
        print(f"sync_check: {err}", file=sys.stderr)
        return 2

    max_lag = max(1, int(round(args.range_ms / 1000 * FPS)))
    lag, corr, _ = best_lag(pic, snd, max_lag)
    offset_ms = lag * 1000 / FPS
    ok = abs(offset_ms) <= args.max_ms and corr >= args.min_corr
    verdict = "PASS" if ok else "WARN"
    if not args.mouth:
        print("sync_check: no --mouth given; using the lower middle of the frame", file=sys.stderr)
    edge = abs(lag) >= max_lag - 0.5
    note = ""
    if corr < args.min_corr:
        note = "low correlation: check the --mouth region, or there is too little speech to measure"
    elif edge:
        note = "peak at the edge of the search range: the real offset may be larger"
    elif not ok:
        note = "picture late: shift the video earlier" if offset_ms > 0 else "picture early: shift the video later"
    result = {"offset_ms": round(offset_ms, 1), "corr": round(corr, 3), "verdict": verdict,
              "frames": int(len(pic) + 1), "mouth": list(box), "note": note}
    print(f"offset {offset_ms:+.0f} ms (+ = picture late)  corr {corr:.2f}  {verdict}" + (f"  ({note})" if note else ""))
    if args.json:
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump(result, fh, indent=1)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
