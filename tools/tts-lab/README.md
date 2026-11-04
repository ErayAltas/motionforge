# tts-lab: local voice (Chatterbox Multilingual)

Free local TTS used by the studio's "local voice" option. Model: [ResembleAI/chatterbox](https://huggingface.co/ResembleAI/chatterbox), MIT license, 23 languages including all ten motionforge languages.

## Install (Python 3.12, about 1.3 GB + about 3.6 GB model download on first run)
```bash
cd tools/tts-lab
python3.12 -m venv .venv-chatterbox
.venv-chatterbox/bin/pip install chatterbox-tts soundfile "setuptools<81"   # setuptools>=81 breaks the watermark module (pkg_resources)

# trailing-noise trimmer (strongly recommended, see below)
python3.12 -m venv .venv-whisper
.venv-whisper/bin/pip install faster-whisper "av>=14,<16"                    # av 16+ breaks faster-whisper (metadata_errors)
```

## Use
```bash
tools/tts-lab/speak.sh videos/<slug>/audio/tts.txt --lang tr --out-dir videos/<slug>/audio/lines
tools/tts-lab/speak.sh tts.txt --lang tr --out-dir lines --only 3 --seed 1   # retake line 3
tools/tts-lab/speak.sh tts.txt --lang tr --out-dir lines --ref my_voice.wav  # own voice only
```
One paragraph per line of `tts.txt`; writes `01.wav`, `02.wav`, ... (24 kHz). Then continue with step 3 of `skills/voice-and-timing`.

## Things to know
- **Trailing noise:** Chatterbox often adds 1-2 s of breath/murmur after the last word (7 of 8 lines in the black-hole video). `speak.sh` therefore recognises every line with faster-whisper (`trim_tails.py`) and cuts it right after the last word; originals stay in `<out-dir>/raw/`, per-line word times in `<out-dir>/line_asr.json`. Without `.venv-whisper` the lines are NOT trimmed and `speak.sh` warns.
- For word timings, use `line_asr.json` plus each line's start offset in the joined voice. Do not spread a line's words over its whole file when the tail is untrimmed: the noise tail makes every word late by up to 2 s.
- Check pronunciation with a per-line round trip (Whisper vs script); mispronounced lines (here `minicik`, `denir`, `kütleçekimini`) were fixed by retaking with `--seed N`, and `kütle çekimini` written with a space in the TTS text.
- Speed on an M2 (MPS): roughly 20-60 s per sentence, slower than real time. Generate once, listen, retake only the lines that need it.
- Every output carries Resemble's PerTh watermark, an inaudible marker that survives MP3 compression and lets detectors recognise the audio as AI-generated.
- Turkish numbers, abbreviations and foreign names: safest to write them out as spoken in the script (`lexicon.json`); digit reading has not been tested.
- `gen_chatterbox.py` + `sentences.json` are the audition set used to compare voices.
