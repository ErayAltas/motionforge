"""Local TTS for motionforge: Chatterbox Multilingual (MIT), free, runs on this machine.

One paragraph per non-empty line of the input file -> one NN.wav per paragraph, so a retake of a
single line is cheap (`--only 3`). Run it through speak.sh, which picks the right Python.

    tools/tts-lab/speak.sh videos/<slug>/audio/tts.txt --lang tr --out-dir videos/<slug>/audio/lines

Reference voice (`--ref voice.wav`, about 10 s of clean speech) clones that voice. Use only your own
voice or one whose owner gave written consent. Without --ref the model's default voice is used.
Every output carries Resemble's inaudible PerTh watermark; this cannot be switched off from here.
"""
import argparse, os, re, sys, time
from pathlib import Path

# The model is cached after the first run. Going to the HF Hub on every start costs seconds to minutes
# (and fails on a flaky network), so load from the cache first; only the first install goes online.
_HF_CACHE = Path(os.environ.get("HF_HOME", Path.home() / ".cache" / "huggingface")) / "hub" / "models--ResembleAI--chatterbox"
if _HF_CACHE.exists() and not os.environ.get("MF_TTS_ONLINE"):
    os.environ.setdefault("HF_HUB_OFFLINE", "1")

import numpy as np
import soundfile as sf
import torch

# Chatterbox checkpoints are saved on CUDA; remap them when loading on MPS/CPU.
_orig_load = torch.load
torch.load = lambda *a, **k: _orig_load(*a, **{**k, "map_location": torch.device("cpu")})

from chatterbox.mtl_tts import SUPPORTED_LANGUAGES, ChatterboxMultilingualTTS

MAX_CHUNK = 220          # characters; longer paragraphs are generated sentence group by sentence group
PAUSE_WITHIN = 0.18      # seconds of silence between chunks of one paragraph


def cap_generation(model, per_char):
    """Chatterbox hardcodes max_new_tokens=1000 (about 40 s of speech). When it fails to emit the end token
    it runs on for that whole budget (seen: 5 s of audio for a 1.8 s line, 10 s of compute for nothing).
    Wrap t3.inference so each chunk gets a budget of per_char tokens per character plus a floor; speech is
    about 25 tokens/s, normal Turkish about 0.07 s per character, so the default leaves a 2x margin."""
    state = {"n": 1000}
    inner = model.t3.inference
    def inference(*args, **kw):
        kw["max_new_tokens"] = min(kw.get("max_new_tokens") or 1000, state["n"])
        return inner(*args, **kw)
    model.t3.inference = inference
    return state


def language_id(code):
    base = code.lower().split("-")[0]
    if base not in SUPPORTED_LANGUAGES:
        sys.exit(f"language '{code}' is not supported by Chatterbox: {', '.join(SUPPORTED_LANGUAGES)}")
    return base


def chunks(text):
    if len(text) <= MAX_CHUNK:
        return [text]
    out, cur = [], ""
    for sent in re.split(r"(?<=[.!?…])\s+", text):
        if cur and len(cur) + 1 + len(sent) > MAX_CHUNK:
            out.append(cur)
            cur = sent
        else:
            cur = f"{cur} {sent}".strip()
    if cur:
        out.append(cur)
    return out


def load(device):
    order = [device] if device != "auto" else (["mps"] if torch.backends.mps.is_available() else []) + ["cpu"]
    for dev in order:
        try:
            return ChatterboxMultilingualTTS.from_pretrained(device=dev), dev
        except Exception as e:  # MPS can fail on some ops; CPU is slower but works
            print(f"device {dev} failed: {e}", file=sys.stderr)
    if os.environ.get("HF_HUB_OFFLINE") == "1" and not os.environ.get("MF_TTS_ONLINE"):
        print("offline load failed (incomplete cache?); retrying online", file=sys.stderr, flush=True)
        os.environ.pop("HF_HUB_OFFLINE", None)
        os.environ["MF_TTS_ONLINE"] = "1"
        os.execv(sys.executable, [sys.executable] + sys.argv)
    sys.exit("could not load Chatterbox on any device")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("text_file", help="UTF-8 file, one paragraph per line")
    ap.add_argument("--lang", required=True, help="en, tr, es, pt-BR, fr, de, zh-CN, ja, ko, hi ...")
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--ref", help="reference voice wav (own voice or written consent)")
    ap.add_argument("--only", help="comma-separated 1-based line numbers to (re)generate")
    ap.add_argument("--seed", type=int, default=0, help="change it for a retake of the same line")
    ap.add_argument("--only-file", help="file with comma-separated 1-based line numbers (written by check_lines.py); overrides --only")
    ap.add_argument("--exaggeration", type=float, default=0.5, help="0.25 calm .. 0.8+ dramatic")
    ap.add_argument("--cfg", type=float, default=0.5, help="lower = slower, more deliberate pacing")
    ap.add_argument("--tokens-per-char", type=float, default=2.6,
                    help="generation budget per character (0 = Chatterbox default of 1000 tokens); raise it if a slow line is cut off")
    ap.add_argument("--device", default="auto", choices=["auto", "mps", "cpu"])
    a = ap.parse_args()

    lang = language_id(a.lang)
    paras = [l.strip() for l in Path(a.text_file).read_text(encoding="utf-8").splitlines() if l.strip()]
    only = Path(a.only_file).read_text().strip() if a.only_file else a.only
    wanted = {int(x) for x in only.split(",") if x.strip()} if only else set(range(1, len(paras) + 1))
    out = Path(a.out_dir)
    out.mkdir(parents=True, exist_ok=True)

    model, dev = load(a.device)
    budget = cap_generation(model, a.tokens_per_char) if a.tokens_per_char > 0 else None
    print(f"chatterbox on {dev}, {len(paras)} lines, lang {lang}", flush=True)
    for i, para in enumerate(paras, 1):
        if i not in wanted:
            continue
        t0 = time.time()
        parts = []
        for j, piece in enumerate(chunks(para)):
            torch.manual_seed(a.seed + i * 100 + j)
            if budget is not None:
                budget["n"] = int(len(piece) * a.tokens_per_char) + 50
            wav = model.generate(piece, language_id=lang, audio_prompt_path=a.ref,
                                 exaggeration=a.exaggeration, cfg_weight=a.cfg)
            if parts:
                parts.append(np.zeros(int(PAUSE_WITHIN * model.sr), dtype=np.float32))
            parts.append(wav.squeeze().cpu().numpy())
        audio = np.concatenate(parts)
        sf.write(out / f"{i:02d}.wav", audio, model.sr)
        print(f"{i:02d}.wav  {len(audio) / model.sr:.1f}s audio in {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
