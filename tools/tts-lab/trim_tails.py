"""Cut Chatterbox's trailing non-speech sound from each NN.wav, in place. Run with .venv-whisper/bin/python.

Chatterbox often appends 1-2 s of breath/murmur after the last word. Each line is recognised with
faster-whisper and cut right after its last word, at the next silence. The untouched file is kept in
<dir>/raw/NN.wav, and the per-line word times (seconds from the start of the trimmed line) go to
<dir>/line_asr.json for the timing step. The recognised text is not used as the script: spelling comes
from the script, only the times from here.

    .venv-whisper/bin/python trim_tails.py videos/<slug>/audio/lines --lang tr
"""
import argparse, json, re, shutil, subprocess
from pathlib import Path

from faster_whisper import WhisperModel


def duration(p):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("lines_dir")
    ap.add_argument("--lang", required=True)
    ap.add_argument("--model", default="small", help="use medium for tr, hi, ko if small mis-times")
    a = ap.parse_args()
    d = Path(a.lines_dir)
    raw = d / "raw"
    raw.mkdir(exist_ok=True)
    info_path = d / "line_asr.json"
    info = json.loads(info_path.read_text()) if info_path.exists() else {}
    model = WhisperModel(a.model, device="cpu", compute_type="int8")
    lang = a.lang.lower().split("-")[0]

    for f in sorted(d.glob("[0-9][0-9].wav")):
        src = raw / f.name
        if f.stem in info and abs(f.stat().st_mtime - info[f.stem].get("mtime", 0)) < 1:
            continue                     # already trimmed by an earlier run and not regenerated since
        shutil.copy(f, src)              # a fresh generation: keep the untouched original, trim from it
        segs, _ = model.transcribe(str(src), language=lang, beam_size=5, word_timestamps=True,
                                   condition_on_previous_text=False)
        ws = [w for s in segs for w in s.words]
        if not ws:
            print(f"{f.name}: no speech recognised, left as is")
            continue
        # lead-in: drop silence before the first word (keep 40 ms)
        head = max(ws[0].start - 0.04, 0.0)
        last = ws[-1].end
        log = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(src), "-af", "silencedetect=noise=-38dB:d=0.10", "-f", "null", "-"],
                             capture_output=True, text=True).stderr
        starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", log)]
        near = [s for s in starts if last - 0.05 <= s <= last + 0.45]
        cut = min((near[0] + 0.06) if near else last + 0.22, duration(src))
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{head:.3f}", "-to", f"{cut:.3f}", "-i", str(src),
                        "-af", f"afade=t=out:st={max(cut - head - 0.05, 0):.3f}:d=0.05", "-ar", "48000", str(f)], check=True)
        info[f.stem] = {"raw_s": round(duration(src), 3), "kept_s": round(cut - head, 3), "tail_cut_s": round(duration(src) - cut, 3),
                        "mtime": f.stat().st_mtime,
                        "words": [{"w": w.word.strip(), "s": round(w.start - head, 3), "e": round(w.end - head, 3)} for w in ws]}
        print(f"{f.name}: {duration(src):.2f}s -> {cut - head:.2f}s (cut {duration(src) - cut:.2f}s of tail)", flush=True)
    info_path.write_text(json.dumps(info, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
