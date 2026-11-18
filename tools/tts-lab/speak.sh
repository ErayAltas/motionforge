#!/bin/sh
# Local TTS (Chatterbox). Usage: tools/tts-lab/speak.sh <tts.txt> --lang tr --out-dir <dir> [--ref voice.wav] [--only 2,5] [--auto-retake N]
# Generates one NN.wav per line, cuts Chatterbox's trailing non-speech sound (needs .venv-whisper; see README),
# and checks each line against the script with Whisper. --auto-retake N (default 2) then retakes only the lines
# that do not match, with a new seed each round, without any agent turn in between. Set N=0 to disable.
# This is a long job (about 10-20 s per line): run it once in the foreground with a long Bash timeout (600000 ms)
# or in the background, never poll it with sleep.
# Exits 3 when the local model is not installed, so callers can fall back to another voice.
# Exits 4 when lines still do not match after the retakes (see <out-dir>/bad.txt); everything else is in place.
HERE=$(cd "$(dirname "$0")" && pwd)
PY="$HERE/.venv-chatterbox/bin/python"
[ -x "$PY" ] || { echo "Chatterbox not installed: see $HERE/README.md" >&2; exit 3; }
TXT="$1"
LANG_ARG=""; OUT_ARG=""; PREV=""; ROUNDS=2; SEED=0; ONLY=""; REF=""; EXAG=0.5; CFG=0.5; DEV=auto
for a in "$@"; do
  case "$PREV" in
    --lang) LANG_ARG="$a" ;;
    --out-dir) OUT_ARG="$a" ;;
    --seed) SEED="$a" ;;
    --only) ONLY="$a" ;;
    --ref) REF="$a" ;;
    --exaggeration) EXAG="$a" ;;
    --cfg) CFG="$a" ;;
    --device) DEV="$a" ;;
    --auto-retake) ROUNDS="$a" ;;
  esac
  PREV="$a"
done
# drop --auto-retake N before calling speak.py (it does not know it); the loop below keeps the original order
for a in "$@"; do
  shift
  if [ "$a" = "--auto-retake" ]; then SKIPNEXT=1; continue; fi
  if [ "${SKIPNEXT:-0}" = 1 ]; then SKIPNEXT=0; continue; fi
  set -- "$@" "$a"
done

"$PY" "$HERE/speak.py" "$@" || exit $?
WPY="$HERE/.venv-whisper/bin/python"
if [ ! -x "$WPY" ] || [ -z "$LANG_ARG" ] || [ -z "$OUT_ARG" ]; then
  echo "WARNING: .venv-whisper missing, trailing noise NOT trimmed and lines NOT checked. Lines may end with 1-2 s of breath/murmur; see $HERE/README.md" >&2
  exit 0
fi
"$WPY" "$HERE/trim_tails.py" "$OUT_ARG" --lang "$LANG_ARG" || exit $?
# a partial run (--only) is a manual retake: trim only, the agent decides what to do next
[ -n "$ONLY" ] && exit 0
n=0
while :; do
  "$WPY" "$HERE/check_lines.py" "$TXT" "$OUT_ARG"; rc=$?
  [ "$rc" = 0 ] && exit 0
  [ "$rc" != 4 ] && exit "$rc"
  n=$((n + 1))
  [ "$n" -gt "$ROUNDS" ] && { echo "Lines still not matching after $ROUNDS retake round(s): $(cat "$OUT_ARG/bad.txt"). Edit the TTS text for them (spell the word as spoken) and retake with --only." >&2; exit 4; }
  echo "--- auto retake round $n: lines $(cat "$OUT_ARG/bad.txt")"
  # retake only the bad lines with a fresh seed, same voice settings
  if [ -n "$REF" ]; then
    "$PY" "$HERE/speak.py" "$TXT" --lang "$LANG_ARG" --out-dir "$OUT_ARG" --only-file "$OUT_ARG/bad.txt" --seed $((SEED + n * 1000)) --exaggeration "$EXAG" --cfg "$CFG" --device "$DEV" --ref "$REF" || exit $?
  else
    "$PY" "$HERE/speak.py" "$TXT" --lang "$LANG_ARG" --out-dir "$OUT_ARG" --only-file "$OUT_ARG/bad.txt" --seed $((SEED + n * 1000)) --exaggeration "$EXAG" --cfg "$CFG" --device "$DEV" || exit $?
  fi
  "$WPY" "$HERE/trim_tails.py" "$OUT_ARG" --lang "$LANG_ARG" || exit $?
done
