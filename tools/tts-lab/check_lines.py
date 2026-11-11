"""Compare every TTS line with what Whisper heard (line_asr.json from trim_tails.py). Run with .venv-whisper/bin/python.

    .venv-whisper/bin/python check_lines.py videos/<slug>/audio/tts.txt videos/<slug>/audio/lines [--min 0.85]

Prints one line per paragraph with a match score (0-1, word level). Lines below --min are bad: their
numbers go to <lines_dir>/bad.txt (comma separated, for `speak.py --only-file`) and the exit code is 4.
Exit 0 when every line matches. Meant for the automatic retake loop in speak.sh, so the agent does not
have to read and compare transcripts by hand.
"""
import argparse, json, re, sys
from difflib import SequenceMatcher
from pathlib import Path


def norm(t):
    t = t.replace("İ", "i").replace("I", "ı").lower()      # Turkish-safe casefold
    return re.findall(r"[^\W_]+", t, flags=re.UNICODE)


def score(want, got):
    """Share of script words that Whisper heard (fuzzy: 'mıknatistir' ~ 'mıknatıstır'; a split word like
    'göz yaşı' still counts via the joined form). Small-model ASR is noisy on Turkish, exact matching would
    flag good lines and waste retakes."""
    if not want:
        return 1.0
    joined = "".join(got)
    hit = 0
    for w in want:
        best = max([SequenceMatcher(None, w, g).ratio() for g in got] or [0])
        if best >= 0.75 or (len(w) > 4 and w in joined):
            hit += 1
    return hit / len(want)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("text_file")
    ap.add_argument("lines_dir")
    ap.add_argument("--min", type=float, default=0.8)
    a = ap.parse_args()
    paras = [l.strip() for l in Path(a.text_file).read_text(encoding="utf-8").splitlines() if l.strip()]
    d = Path(a.lines_dir)
    info = json.loads((d / "line_asr.json").read_text()) if (d / "line_asr.json").exists() else {}
    bad = []
    for i, para in enumerate(paras, 1):
        rec = info.get(f"{i:02d}")
        if not rec:
            print(f"{i:02d}  missing/no speech"); bad.append(i); continue
        want, got = norm(para), norm(" ".join(w["w"] for w in rec["words"]))
        sc = score(want, got)
        flag = "" if sc >= a.min else "  <-- RETAKE"
        print(f"{i:02d}  {sc:.2f}  {para[:60]}{flag}")
        if sc < a.min:
            print(f"      heard: {' '.join(got)[:100]}"); bad.append(i)
    (d / "bad.txt").write_text(",".join(map(str, bad)))
    sys.exit(4 if bad else 0)


if __name__ == "__main__":
    main()
