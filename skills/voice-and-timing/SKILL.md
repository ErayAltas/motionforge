---
name: voice-and-timing
description: Produce the voice-over (bring-your-own-key TTS such as ElevenLabs or OpenAI, local Chatterbox (default), Kokoro or Piper, or the user's own recording) behind a mandatory consent and cost gate, then time every word, build captions, and mix voice, music, effects and footage audio to a loudness target. Use when a video needs narration, word-synced animation or captions, or when audio levels need fixing.
license: MIT
---

# Voice and timing

The voice is the clock of the video. Get it right first; every scene is cued from its words.

Files (in `videos/<slug>/audio/`): `lines/NN.wav` (one file per script paragraph), `voice.wav`, `words.json` (`[{"w","s","e"}]`, seconds), `segments.json` (`[{"start","end","text"}]`), `lexicon.json`, `music.*`, `sfx/`, `mix.wav`, `captions.srt`.

## 1. Choose the voice path (ask the user)

| Path | Cost | Notes |
|---|---|---|
| No voice | free | on-screen type carries the story; captions become the script |
| User's own recording | free | best authenticity; go to step 4 |
| Local TTS: Chatterbox (`tools/tts-lab/speak.sh`) | free | **default local voice**; MIT; all ten motionforge languages incl. tr; slow (20-60 s per sentence on an M2); output carries an inaudible PerTh AI watermark; optional `--ref` own-voice clone (consent rules below) |
| Local TTS: Kokoro | free | runs on CPU; good in en, es, fr, hi, it, ja, pt-BR, zh; no Turkish/German/Korean voices |
| Local TTS: Piper | free | many languages incl. tr, de; each voice model has its own license, read its model card before commercial use |
| ElevenLabs API | paid per character | strong multilingual voices; the user's own key |
| OpenAI TTS API | paid per character / token | fast, several preset voices; the user's own key |

Voice cloning only with the documented consent of the person whose voice it is. Never clone from public videos, podcasts or other people's media.

## 2. Consent and cost gate (mandatory before any paid call)
1. Finalise the script (`script-and-hooks`, approved). Count the characters that will be sent, spaces included:
   `python3 -c "import sys;print(len(open(sys.argv[1],encoding='utf-8').read()))" videos/<slug>/audio/tts.txt`
2. Look up the provider's current price for the user's plan or model (pricing pages change; write the date you checked). If you cannot check, give the formula and say the rate is unverified.
3. Tell the user, in their language: provider, model, voice, number of lines, characters, estimated cost or credits, and that retakes cost again. Example: "ElevenLabs, 14 lines, 1,184 characters ≈ 1,184 credits at the current per-character rate. Shall I generate?"
4. Wait for an explicit yes. Tests, single-line auditions and comparisons are paid calls too; they need the same yes.
5. Keys come only from the environment (`ELEVENLABS_API_KEY`, `OPENAI_API_KEY`). Never print them, never write them to a file in the repo, never put them in a commit. Personal voice IDs go in an untracked `.env` (e.g. `ELEVENLABS_VOICE_ID`), not in code.

Until the yes, build with a scratch voice (a local TTS) and mark it "scratch, do not ship".

## 3. Generate, one line per paragraph
One file per paragraph makes retakes cheap and keeps pauses controllable. Apply `lexicon.json` replacements to the text before sending.

**ElevenLabs**
```bash
curl -sS -X POST "https://api.elevenlabs.io/v1/text-to-speech/$ELEVENLABS_VOICE_ID?output_format=mp3_44100_128" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" -H "Content-Type: application/json" \
  -d @audio/lines/01.json -o audio/lines/01.mp3
# 01.json: {"text": "...", "model_id": "<model>", "voice_settings": {"stability": 0.5, "similarity_boost": 0.75, "speed": 1.0}}
```
**OpenAI**
```bash
curl -sS https://api.openai.com/v1/audio/speech -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" -d @audio/lines/01.json -o audio/lines/01.wav
# 01.json: {"model": "<tts model>", "voice": "<voice>", "input": "...", "response_format": "wav"}
```
**Chatterbox (default local voice)**
```bash
tools/tts-lab/speak.sh audio/tts.txt --lang <code> --out-dir audio/lines   # tts.txt: one paragraph per line -> lines/01.wav, 02.wav ...
tools/tts-lab/speak.sh audio/tts.txt --lang <code> --out-dir audio/lines --only 3 --seed 1   # manual retake of one line
```
**Run it once and wait for it.** It takes about 10-20 s per line, so start it with the Bash timeout at its maximum (600000 ms) or in the background, and wait for the exit. Never poll with `sleep N; ls lines` (every poll costs a model turn), never start a second copy while one runs, and do not try seeds in a loop by hand.
`speak.sh` also cuts Chatterbox's 1-2 s trailing noise after each line (needs `tools/tts-lab/.venv-whisper`; it writes `lines/line_asr.json` with per-line word times, use those for step 4 instead of Whisper on the joined voice). A full run (no `--only`) also checks every line against the script with Whisper (`check_lines.py`) and **retakes the lines that do not match automatically**, up to `--auto-retake N` rounds (default 2, new seed each round, `0` = off); the score table is printed. Exit code 4 means some lines still do not match after the rounds (numbers in `lines/bad.txt`): change the spelling in `tts.txt` for those words (write them as spoken), then retake with `--only N`. Exit 0 means every line passed; you only need to listen to names and sign-offs. Exit code 3 means the model is not installed (`tools/tts-lab/README.md`); say so and use a scratch voice. Outputs are 24 kHz mono; the join in the next list resamples to 48 kHz. Write numbers and abbreviations as spoken in `tts.txt`.

**Kokoro** (`pip install kokoro soundfile`) or **Piper** (`piper --model <voice>.onnx --output_file audio/lines/01.wav < audio/lines/01.txt`).

Then:
1. Check every file: duration > 0, plays to the end, the last words are present (the ASR in step 4 catches cut-offs).
2. **Chatterbox lines: `python3 tools/join_lines.py audio`** (`--gap 0.35`, `--gaps 2=1.3,7=0.3` for the gap before line n, `--over 3=try_s2` to take one line from another folder). It writes `voice.wav`, `words.json` and `segments.json` in one go, with the script's spelling and the timings from `lines/line_asr.json`, so **step 4 is skipped** (no Whisper run on the joined file). It lists lines where ASR and script words differ (digits, merged words); check those by ear. Do not write a one-off join script. For other voices, join with deliberate pauses (0.25–0.45 s between sentences, longer before a reveal):
   `ffmpeg -i 01.wav -i 02.wav -filter_complex "[0]apad=pad_dur=0.35[a];[a][1]concat=n=2:v=0:a=1" -ar 48000 audio/voice.wav` (extend for more lines).
3. Let the user listen to `voice.wav` before you animate. A voice change later shifts every cue.

## 4. Word timings
Skip this section when `tools/join_lines.py` already wrote `words.json` (Chatterbox lines). It is for voices without per-line ASR (ElevenLabs, OpenAI, a recorded file).
```bash
python3 tools/word_timings.py audio/voice.wav --out audio/words.json --segments-out audio/segments.json \
  --language <iso> --model small --text audio/tts.txt
# <iso> is the Whisper code: en, tr, es, pt (for pt-BR), fr, de, zh (for zh-CN), ja, ko, hi
```
- Main path: faster-whisper with word timestamps. Use at least the `small` model; `medium` or larger for tr, hi, ko and noisy recordings. Pass the language explicitly.
- **Fallback (segment mode)**, automatic when faster-whisper is missing, forced with `--engine segments` when word timestamps are poor:
  1. find pauses: `ffmpeg -i audio/voice.wav -af silencedetect=noise=-35dB:d=0.18 -f null - 2>&1 | grep silence_`;
  2. cut the audio between pauses into segments and transcribe each segment on its own;
  3. spread the words of a segment over its duration in proportion to their letter count; write `segments.json` and `words.json`.
- **Correct against the script.** ASR misspells names ("Cloud Code" for "Claude Code"). Align the ASR words to the script words (sequence alignment) and keep the timings with the script spelling. If more than ~20% of words differ, something is wrong: wrong language, mispronunciation, or the audio does not match the script. Listen before going on.
- zh-CN and ja: time per character or per phrase; ko: per eojeol.
- Footage with speech but no script: transcribe, let the user fix the text, then align again with the corrected text.

### Using the timings in scenes
Look words up by prefix after a given time, with locale-aware lowercasing:
```js
const at = (words, prefix, after = 0, locale = "en") => {
  const p = prefix.toLocaleLowerCase(locale);
  const hit = words.find(x => x.s >= after - 0.01 &&
    x.w.replace(/^["“'«]/, "").toLocaleLowerCase(locale).startsWith(p));
  if (!hit) throw new Error(`word not found: ${prefix}`);
  return hit.s;
};
// at(words, "launch") ; repeated word: at(words, "every", 38) ; Turkish: locale "tr"
```
Throwing on a missing word is deliberate: a changed script must break the build, not shift a cue silently.

## 5. Captions
Build caption chunks from `words.json` with the **display** text (digits allowed), not the spoken form.

| Rule | Vertical (9:16) | Horizontal (16:9) |
|---|---|---|
| Size of a chunk | 1–4 words, about 24 characters max | up to 42 characters per line, max 2 lines |
| Break after | a sentence end; a comma once the chunk has 2+ words | a sentence end; when the next word would pass 42 characters |
| Orphans | never leave a single word alone at the end of a sentence; pull it into the previous chunk | balance two lines to similar length |
| Minimum on screen | 0.6 s; if shorter, merge with a neighbour when the result still fits, otherwise extend into the gap | same |
| Overlap | none; a chunk ends when the next starts | same |

- **Sentence ends** are `. ! ? …` except abbreviations and initials: `Dr. Mr. Mrs. Prof. St. vs. etc. e.g. i.e. U.S. U.K. Inc. Ltd. No.`, Turkish `Dr. Prof. Doç. vb. vs. bkz. örn. yy.`, single-letter initials (`J. Smith`), and Turkish ordinals (`3. adım`). Add the video language's own list.
- Chunks whose start times are less than 0.05 s apart (broken timestamps) are merged, never dropped.
- Style: the current word in the accent color; ≥ 48 px at 1080 wide; outline or shadow for contrast on any background; caption zone y 1150–1500 on 9:16, clear of the platform buttons on the right.
- CJK: break between characters, never before closing punctuation. Hindi: never split inside a conjunct; break at spaces.
- When burning in with libass/ASS, escape backslashes and braces in the text.
- Always also export `renders/captions.srt` (platform upload, accessibility).

## 6. Mixing and loudness
**Targets:** integrated −14 LUFS and true peak ≤ −1 dBTP for Reels/Shorts/TikTok/YouTube; −16 LUFS when the platform or client asks (podcast feeds, some broadcasters). Measure:
```bash
bash tools/loudness.sh measure renders/<slug>-v1.mp4            # integrated LUFS, LRA, true peak
bash tools/loudness.sh compare audio/voice.wav audio/mix.wav     # is the voice still on top?
bash tools/loudness.sh normalize audio/mix.wav audio/mix-14.wav -14 -1.5   # two-pass, linear gain
```
**Levels relative to the voice:**
- music: 18–25 dB below the voice while it speaks, ducked by the voice (sidechain), may rise in pauses;
- sound effects: 12–18 dB below the voice, short, on the contact frame; a whoosh starts ~0.25 s before its cut;
- the biggest hit goes in a pause, never under a word.

```bash
ffmpeg -i audio/voice.wav -i audio/music.mp3 -i audio/sfx.wav -filter_complex \
 "[0]asplit=2[v][key];[1]volume=-20dB[m];[m][key]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=300[md];\
  [v][md][2]amix=inputs=3:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[out]" -map "[out]" -ar 48000 audio/mix.wav
```
One-pass `loudnorm` misses the target by about half a LU; finish with `tools/loudness.sh normalize` (two-pass) and re-measure.

**Own footage audio vs TTS.** When the presenter's recorded speech and a TTS voice both appear:
1. measure each separately (ebur128) and match their integrated loudness within 1 LU before mixing;
2. high-pass both at ~80 Hz; give the room recording light compression so its dynamics sit near the TTS;
3. crossfade 50–100 ms at every switch; keep a little room tone under the TTS part if the cut feels dry;
4. if the footage sound is not used, strip it (`-an`, or `muted` in Remotion).
`qa-review` checks voice-only stretches against the full mix (parity within 1–2 LU).

**Music and effects licensing:** the user's own, generated locally, or a license that allows the use (CC0, public domain, CC BY with credit). Record each file in `assets/CREDITS.md`.
