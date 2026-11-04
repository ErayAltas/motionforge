#!/bin/sh
# Local TTS (Chatterbox). Usage: tools/tts-lab/speak.sh <tts.txt> --lang tr --out-dir <dir> [--ref voice.wav] [--only 2,5]
# Generates one NN.wav per line, then cuts Chatterbox's trailing non-speech sound (needs .venv-whisper; see README).
# Exits 3 when the local model is not installed, so callers can fall back to another voice.
HERE=$(cd "$(dirname "$0")" && pwd)
PY="$HERE/.venv-chatterbox/bin/python"
[ -x "$PY" ] || { echo "Chatterbox not installed: see $HERE/README.md" >&2; exit 3; }
"$PY" "$HERE/speak.py" "$@" || exit $?
# find --lang and --out-dir again for the trimming step
LANG_ARG=""; OUT_ARG=""; PREV=""
for a in "$@"; do
  [ "$PREV" = "--lang" ] && LANG_ARG="$a"
  [ "$PREV" = "--out-dir" ] && OUT_ARG="$a"
  PREV="$a"
done
WPY="$HERE/.venv-whisper/bin/python"
if [ -x "$WPY" ] && [ -n "$LANG_ARG" ] && [ -n "$OUT_ARG" ]; then
  "$WPY" "$HERE/trim_tails.py" "$OUT_ARG" --lang "$LANG_ARG"
else
  echo "WARNING: .venv-whisper missing, trailing noise NOT trimmed. Lines may end with 1-2 s of breath/murmur; see $HERE/README.md" >&2
fi
