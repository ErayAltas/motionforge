#!/usr/bin/env python3
"""
mouth_curve.py — turn a voice-over into a per-frame mouth curve (free, local, no API)
© 2026 motionforge contributors, MIT

Usage:
    python3 tools/mouth_curve.py voice.mp3 -o mouth.json --fps 30
    python3 tools/mouth_curve.py voice.wav -o mouth.json --fps 30 --smooth-ms 60 --gate-db 8

Needs: ffmpeg on PATH (decodes mp3/wav/m4a/...), Python 3.10+, numpy.

Output (JSON, one entry per video frame; other tools read this exact format):
    {
      "version": 1,
      "fps": 30,
      "duration": 12.4,                    # seconds of audio covered
      "open":  [0.0, 0.12, 0.57, ...],     # mouth opening 0..1 per frame, 3 decimals
      "shape": ["closed", "open", ...],    # per frame: "closed" | "open" | "wide" | "round"
      "source": "voice.mp3"                # audio file name (no folders)
    }
    Frame i covers the time i / fps. len(open) == len(shape) == ceil(duration * fps).

How it works:
    1. ffmpeg decodes the file to mono 16 kHz float samples.
    2. RMS loudness per frame (Hann window two frames wide), in dB.
    3. Noise gate: frames quieter than the noise floor (10th percentile) + --gate-db are silent.
    4. Normalisation: the quiet end of the speech (20th percentile of voiced frames, never below
       the gate) maps to 0 and the 95th percentile maps to 1, so the mouth opens on syllables
       and nearly closes between them instead of hanging open.
    5. Attack/release smoothing: the mouth opens fast (attack = smooth/3) and closes more
       slowly (release = --smooth-ms), so it does not chatter.
    6. Shape hint from three spectral bands (low 150-800 Hz, mid 800-1800 Hz, high 1800-4500 Hz),
       compared with the speaker's own median: little mid energy -> "round" (o, u),
       strong high band -> "wide" (i, e), otherwise "open" (a); quiet frames -> "closed".
       A short majority filter removes one-frame flicker. It is a coarse hint, not phoneme
       recognition: good enough to vary a cartoon mouth, not for close-up realistic lip-sync.
    7. --lead-ms shifts the curve earlier (default 40 ms): mouths that move a hair before the
       sound read as in sync; mouths that lag read as dubbed.

Determinism: the same file and options always give the same JSON.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import subprocess
import sys

try:
    import numpy as np
except ImportError:  # pragma: no cover - message for the user
    sys.exit("mouth_curve: numpy is missing. Install it with: python3 -m pip install numpy")

SR = 16000
SHAPES = ("closed", "open", "wide", "round")


def decode(path: str) -> np.ndarray:
    if not shutil.which("ffmpeg"):
        sys.exit("mouth_curve: ffmpeg is not on PATH (install it: apt install ffmpeg / brew install ffmpeg)")
    cmd = ["ffmpeg", "-v", "error", "-nostdin", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"]
    try:
        raw = subprocess.run(cmd, check=True, stdout=subprocess.PIPE).stdout
    except subprocess.CalledProcessError as err:
        sys.exit(f"mouth_curve: ffmpeg could not decode {path} (exit {err.returncode})")
    audio = np.frombuffer(raw, dtype="<f4").astype(np.float64)
    if audio.size == 0:
        sys.exit(f"mouth_curve: {path} has no audio samples")
    return audio


def frame_features(audio: np.ndarray, fps: float):
    """RMS (dB) and band energies per video frame."""
    hop = SR / fps
    n_frames = int(math.ceil(len(audio) / hop))
    win = int(round(2 * hop))
    win += win % 2
    nfft = 1 << (win - 1).bit_length()
    window = np.hanning(win)
    pad = np.concatenate([np.zeros(win // 2), audio, np.zeros(win)])
    freqs = np.fft.rfftfreq(nfft, 1.0 / SR)
    bands = [(150, 800), (800, 1800), (1800, 4500)]
    masks = [(freqs >= lo) & (freqs < hi) for lo, hi in bands]

    rms_db = np.empty(n_frames)
    band_e = np.empty((n_frames, 3))
    for i in range(n_frames):
        start = int(round(i * hop))  # window centred on the frame time (pad shifts by win/2)
        seg = pad[start:start + win]
        if len(seg) < win:
            seg = np.concatenate([seg, np.zeros(win - len(seg))])
        seg = seg * window
        rms = math.sqrt(float(np.mean(seg * seg)) + 1e-12)
        rms_db[i] = 20 * math.log10(rms + 1e-9)
        spec = np.abs(np.fft.rfft(seg, nfft)) ** 2
        band_e[i] = [float(spec[m].sum()) + 1e-12 for m in masks]
    return rms_db, band_e


def envelope(rms_db: np.ndarray, gate_db: float, fps: float, smooth_ms: float, lead_ms: float):
    floor = float(np.percentile(rms_db, 10))
    gate = max(floor + gate_db, -60.0)
    voiced = rms_db[rms_db > gate]
    top = float(np.percentile(voiced, 95)) if voiced.size else gate + 20.0
    # the bottom of the speech range (not the gate) maps to 0, so syllables open and close the mouth
    low = max(gate, float(np.percentile(voiced, 20)) - 2.0) if voiced.size else gate
    span = max(top - low, 6.0)
    x = np.clip((rms_db - low) / span, 0.0, 1.0) ** 1.2

    release = max(smooth_ms, 1.0) / 1000.0
    attack = release / 3.0
    a_att = 1.0 - math.exp(-1.0 / (attack * fps))
    a_rel = 1.0 - math.exp(-1.0 / (release * fps))
    y = np.empty_like(x)
    cur = 0.0
    for i, v in enumerate(x):
        cur += (v - cur) * (a_att if v > cur else a_rel)
        y[i] = cur

    lead = int(round(lead_ms / 1000.0 * fps))
    if lead > 0:
        y = np.concatenate([y[lead:], np.zeros(lead)])
    peak = float(y.max()) if y.size else 0.0
    if peak > 0:
        y = y / peak
    return y, gate, rms_db > gate


def shape_hints(open_: np.ndarray, band_e: np.ndarray, voiced: np.ndarray, fps: float, lead_ms: float):
    logb = np.log10(band_e)
    mid_vs_low = logb[:, 1] - logb[:, 0]   # low for o / u (second formant sits low)
    high_vs_mid = logb[:, 2] - logb[:, 1]  # high for i / e (second formant sits high)

    def z(feature):
        if voiced.sum() < 5:
            return np.zeros_like(feature)
        return (feature - np.median(feature[voiced])) / (np.std(feature[voiced]) + 1e-6)

    z_mid = z(mid_vs_low)
    z_high = z(high_vs_mid)

    lead = int(round(lead_ms / 1000.0 * fps))
    if lead > 0:  # keep the hint aligned with the shifted envelope
        z_mid = np.concatenate([z_mid[lead:], np.zeros(lead)])
        z_high = np.concatenate([z_high[lead:], np.zeros(lead)])

    codes = np.ones(len(open_), dtype=int)  # 1 = open
    codes[z_high > 0.6] = 2                   # wide
    codes[(z_mid < -0.6) & (z_high < 0.3)] = 3  # round
    codes[open_ < 0.08] = 0                   # closed

    # majority filter over 5 frames (closed frames stay closed: they come from the envelope)
    out = codes.copy()
    for i in range(len(codes)):
        if codes[i] == 0:
            continue
        win = codes[max(0, i - 2):i + 3]
        win = win[win > 0]
        out[i] = int(np.bincount(win, minlength=4).argmax())
    return [SHAPES[c] for c in out]


def main(argv=None):
    ap = argparse.ArgumentParser(description="Per-frame mouth-open curve and shape hint from a voice-over (local, free).")
    ap.add_argument("audio", help="voice-over file (mp3, wav, m4a, ...)")
    ap.add_argument("-o", "--out", default="mouth.json", help="output JSON (default: mouth.json)")
    ap.add_argument("--fps", type=float, default=30.0, help="video frame rate (default: 30)")
    ap.add_argument("--smooth-ms", type=float, default=60.0, help="release time of the smoothing in ms; attack is a third of it (default: 60)")
    ap.add_argument("--gate-db", type=float, default=8.0, help="noise gate in dB above the noise floor (default: 8)")
    ap.add_argument("--lead-ms", type=float, default=40.0, help="move the mouth this many ms ahead of the sound (default: 40)")
    args = ap.parse_args(argv)

    if args.fps <= 0:
        sys.exit("mouth_curve: --fps must be positive")
    if not os.path.isfile(args.audio):
        sys.exit(f"mouth_curve: file not found: {args.audio}")

    audio = decode(args.audio)
    duration = len(audio) / SR
    rms_db, band_e = frame_features(audio, args.fps)
    open_, gate, voiced = envelope(rms_db, args.gate_db, args.fps, args.smooth_ms, args.lead_ms)
    shapes = shape_hints(open_, band_e, voiced, args.fps, args.lead_ms)

    fps_out = int(args.fps) if float(args.fps).is_integer() else args.fps
    data = {
        "version": 1,
        "fps": fps_out,
        "duration": round(duration, 3),
        "open": [round(float(v), 3) for v in open_],
        "shape": shapes,
        "source": os.path.basename(args.audio),
    }
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(data, fh, separators=(",", ":"))
        fh.write("\n")

    counts = {s: shapes.count(s) for s in SHAPES}
    talking = sum(1 for v in open_ if v >= 0.08) / max(1, len(open_))
    print(f"mouth_curve: {len(open_)} frames @ {fps_out} fps ({duration:.2f} s), gate {gate:.1f} dBFS, "
          f"mouth moving {talking:.0%} of the time; shapes {counts} -> {args.out}")


if __name__ == "__main__":
    main()
