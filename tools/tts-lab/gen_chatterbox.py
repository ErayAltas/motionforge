"""Chatterbox Multilingual (MIT) Turkish samples. Run with .venv-chatterbox/bin/python."""
import json, sys, time
from pathlib import Path

import soundfile as sf
import torch

# Chatterbox checkpoints are saved on CUDA; remap them when loading on MPS/CPU.
_orig_load = torch.load
torch.load = lambda *a, **k: _orig_load(*a, **{**k, "map_location": torch.device("cpu")})

from chatterbox.mtl_tts import ChatterboxMultilingualTTS

HERE = Path(__file__).parent
OUT = HERE / "samples"
OUT.mkdir(exist_ok=True)
sentences = json.loads((HERE / "sentences.json").read_text())

device = sys.argv[1] if len(sys.argv) > 1 else ("mps" if torch.backends.mps.is_available() else "cpu")
print("device", device, flush=True)
model = ChatterboxMultilingualTTS.from_pretrained(device=device)
for s in sentences:
    torch.manual_seed(0)
    t0 = time.time()
    wav = model.generate(s["text"], language_id="tr")
    sf.write(OUT / f"chatterbox_{s['id']}.wav", wav.squeeze().cpu().numpy(), model.sr)
    print(f"chatterbox {s['id']} {time.time() - t0:.1f}s", flush=True)
