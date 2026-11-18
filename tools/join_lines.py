#!/usr/bin/env python3
"""Join audio/lines/NN.wav into voice.wav and write words.json + segments.json (script spelling, ASR timings).

Replaces the one-off join scripts each video used to write. Input is what `tools/tts-lab/speak.sh` leaves
behind: lines already trimmed at head and tail, plus lines/line_asr.json with per-line word times. Needs numpy
and ffmpeg; no Whisper run on the joined file.

    python3 tools/join_lines.py videos/<slug>/audio                     # 0.35 s between lines
    python3 tools/join_lines.py videos/<slug>/audio --gap 0.4 --gaps 2=1.3,7=0.3   # gap BEFORE line n
    python3 tools/join_lines.py videos/<slug>/audio --over 3=try_s2     # take line 3 from audio/try_s2/03.wav

Word times: when ASR heard exactly the script's words they are used as they are. Otherwise (digits, merged or
split words, apostrophes) the script words are spread over the ASR span of that line by letter count, so a line
is never off by more than its own length. Lines where this fallback ran are reported; check those by ear.
"""
import argparse, json, re, subprocess, sys, wave
from pathlib import Path

import numpy as np

SR = 48000


def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.int16)


def glue_apostrophes(words):
    """Whisper splits "Roma'ya" into "Roma" + "'ya"; put them back together."""
    out = []
    for w in words:
        if out and w["w"][:1] in "'’":
            out[-1] = {"w": out[-1]["w"] + w["w"], "s": out[-1]["s"], "e": w["e"]}
        else:
            out.append(dict(w))
    return out


def spread(tokens, t0, t1):
    """Script tokens over [t0, t1] in proportion to letter count."""
    wts = [len(re.sub(r"\W", "", w)) + 1 for w in tokens]
    x, out = t0, []
    for w, k in zip(tokens, wts):
        e = x + (t1 - t0) * k / sum(wts)
        out.append((x, e)); x = e
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("audio_dir", help="folder with tts.txt and lines/")
    ap.add_argument("--gap", type=float, default=0.35, help="seconds of silence between lines")
    ap.add_argument("--gaps", default="", help="per-line gap BEFORE that line, e.g. 2=1.3,7=0.3")
    ap.add_argument("--over", nargs="*", default=[], help="N=dir: take line N (and its ASR) from audio_dir/dir")
    a = ap.parse_args()
    d = Path(a.audio_dir)
    gaps = {int(k): float(v) for k, v in (p.split("=") for p in a.gaps.split(",") if p)}
    over = dict(p.split("=") for p in a.over)
    script = [l.strip() for l in (d / "tts.txt").read_text(encoding="utf-8").splitlines() if l.strip()]

    chunks, words, segs, fallback, t = [], [], [], [], 0.0
    for n, line in enumerate(script, 1):
        src = d / over.get(str(n), "lines")
        wav = src / f"{n:02d}.wav"
        if not wav.exists():
            sys.exit(f"missing {wav}: run tools/tts-lab/speak.sh first")
        rec = json.loads((src / "line_asr.json").read_text(encoding="utf-8")).get(f"{n:02d}") if (src / "line_asr.json").exists() else None
        if n > 1:
            g = gaps.get(n, a.gap)
            chunks.append(np.zeros(int(g * SR), dtype=np.int16)); t += g
        pcm = load(wav)
        dur = len(pcm) / SR
        toks = line.split()
        asr = glue_apostrophes(rec["words"]) if rec else []
        if len(asr) == len(toks):
            ts = [(t + w["s"], t + w["e"]) for w in asr]
        else:
            fallback.append(n)
            s0, e0 = (asr[0]["s"], asr[-1]["e"]) if asr else (0.0, dur)
            ts = [(t + s, t + e) for s, e in spread(toks, s0, e0)]
        ts[-1] = (ts[-1][0], min(max(ts[-1][1], ts[-1][0] + 0.05), t + dur))
        words += [{"w": w, "s": round(s, 3), "e": round(e, 3)} for w, (s, e) in zip(toks, ts)]
        segs.append({"start": round(t, 3), "end": round(t + dur, 3), "text": line})
        chunks.append(pcm); t += dur

    y = np.concatenate(chunks)
    with wave.open(str(d / "voice.wav"), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(y.tobytes())
    (d / "words.json").write_text(json.dumps(words, ensure_ascii=False, indent=1), encoding="utf-8")
    (d / "segments.json").write_text(json.dumps(segs, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"voice.wav {t:.2f}s, {len(script)} lines, {len(words)} words")
    if fallback:
        print(f"letter-count timing used on lines {fallback} (ASR words != script words); check them by ear")


if __name__ == "__main__":
    main()
