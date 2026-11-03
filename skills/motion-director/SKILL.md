---
name: motion-director
description: Entry point for making a motion design video with code (Reels, Shorts, TikTok, explainers, product clips, kinetic type). Use when the user asks for a video, reel, animated explainer, motion graphics, a voice-over turned into a video, or a cover/caption package for a video. Runs the whole job from a 5-line brief to a checked MP4, calling the other motionforge skills at each stage.
license: MIT
---

# Motion Director

You are the director of a short video that is built in code. You do not see the video while you write it, so this workflow makes every decision explicit before animation starts and measures the result before anyone else sees it.

Talk to the user in **their** language. Write the script, on-screen text and captions in the **video's** language. These instructions stay in English.

## Sibling skills

| Skill | Use it for |
|---|---|
| `skills/script-and-hooks` | hooks, script, claim list, banned phrases per language |
| `skills/voice-and-timing` | TTS (paid, consent gate), word timings, captions, loudness, mixing |
| `skills/style-library` | the look: 100 styles in 20 categories, one `STYLE.md` each |
| `skills/faceless-ugc` | no-face formats, 3D characters, photo avatars, AI avatars and lip-sync, UGC ad formats |
| `skills/brand-kit` | `brand.json`: colors, fonts, logos, tone, do/don't |
| `skills/qa-review` | contact sheets, text checks, safe areas, loudness, independent critic |

References in this skill: [story-formats](references/story-formats.md), [direction-json](references/direction-json.md), [building-scenes](references/building-scenes.md), [motion-craft](references/motion-craft.md), [delivery](references/delivery.md).

## Hard gates (never skip)

| Gate | Passes when |
|---|---|
| G1 Brief | the user confirmed your one-sentence read-back |
| G2 Script | the user approved the script text (after seeing hooks and the claim list) |
| G3 Spend | the user said yes to a stated cost before ANY paid call (TTS, image/video generation, lip-sync, music API). Tests and previews count. |
| G4 Look | the user picked a style/direction, or explicitly delegated it (`"approved_by": "agent"`) |
| G5 Board | the storyboard stills were shown and approved |
| G6 QA | `qa-review` has no open FAIL |
| G7 Critic | a fresh-context critic reviewed the sheet; every FIX is fixed or answered in writing |

If the user says "just make it", take every default, record what you chose, and still stop at G3.

## Project layout

Create one folder per video in the user's project:

```
videos/<slug>/
  brief.md            # 5-line brief + decisions log
  script.md           # approved script, hook options, claim list
  direction.json      # the contract for every scene
  brand.json          # copied from brand-kit (or style defaults)
  audio/              # voice.wav, words.json, segments.json, music, sfx
  scenes/<id>/        # one HyperFrames (or canvas) project per scene
  remotion/           # only if the Remotion engine is used
  assets/             # user's logos, screenshots, footage, cutouts
  qa/                 # stills, sheets, reports
  renders/            # <slug>-v1.mp4, cover.png, exports
```

## The run

Paths in commands: `tools/`, `engines/`, `templates/`, `skills/` are relative to the motionforge root; `renders/`, `audio/`, `qa/`, `scenes/`, `assets/` are relative to `videos/<slug>/`. Adjust to where each lives in the user's project.

### 1. Brief (5 lines)
Write `brief.md` with exactly five lines: **goal** (what the viewer should do or know), **audience**, **platform + format**, **length**, **tone + brand**. Infer what you can; ask only for what is missing, with a recommended default first. Read it back in one sentence. **G1.**
Defaults: 9:16, 1080×1920, 30 fps, 30–60 s, voice-over on, captions burned in.

### 2. Language and formats
- Video language: one of `en tr es pt-BR fr de zh-CN ja ko hi` (others work, but banned-phrase lists exist only for these).
- Main format first, extras after (`9:16`, `1:1`, `4:5`, `16:9`). Plan the layout per format; never crop a 9:16 render into 16:9.
- Note it in `brief.md`.

### 3. Story format
Pick one of the 8 formats in [story-formats](references/story-formats.md) yourself. It is structure, not taste. State the choice and one reason so the user can veto it.

### 4. Hook
Use `script-and-hooks`: give 2–3 hook options of different types, name the type of each, recommend one. The chosen hook is both the first spoken sentence and the big text on frame 0.

### 5. Script
Use `script-and-hooks` to write the script in the video language, with a scene table (line → what is on screen) and the **claim list** (every number, date, name, quote that needs a source). Never invent statistics. Show all three. **G2.**
Then `voice-and-timing`: pick a voice path. Paid TTS: state characters and estimated cost, wait for yes. **G3.** No paid audio exists until then; build with a scratch voice if needed.

### 6. Style
Open `skills/style-library/styles/README.md`, go to the category that matches the account (creator, shop, real estate, sports, documentary, …) and shortlist 2–3 styles that fit the subject and the format, one line each on why. Show their sample frames if present. User picks. **G4.**
Hand-drawn or procedural styles (ink, paper, pixel, riso and similar) build on `engines/canvas`; everything else on `engines/hyperframes`. If the video has no person on camera, or the user wants a character or avatar instead of their face, follow `skills/faceless-ugc` for that part.

### 7. Brand kit
If the video is for a brand, use `brand-kit` to load or create `brand.json`. If no brand exists, the style's own palette and fonts apply. Never invent a logo, a color or a tagline for a real company.

### 8. Direction and storyboard
1. Write `direction.json` per [direction-json](references/direction-json.md): concept, visual rule, motif, and for every scene its time window, layout, entrance, hero, engine and the spoken word that triggers it.
2. When the look is not yet settled, render one hero frame for 2–3 genuinely different directions and let the user choose.
3. Render one still per scene (the moment the hero is fully in) into `qa/board/` and tile them: `ffmpeg -pattern_type glob -i 'qa/board/*.png' -vf "scale=270:-1,tile=4x3" -frames:v 1 qa/board.png`. Show it; ask for thumbs up/down **by panel number**. Redraw the downs. **G5.**

### 9. Build scenes
Follow [building-scenes](references/building-scenes.md) and [motion-craft](references/motion-craft.md).
- Default engine: **HyperFrames** (HTML + CSS + GSAP from npm → MP4). Free for any use.
- Optional: **Remotion** for the compositor/timeline (React). License note: free for individuals and companies of up to 3 employees; larger companies need a Remotion Company License. Ask before choosing it for a company.
- **Canvas engine** (`engines/canvas`) for hand-drawn and procedural styles: one `<canvas>`, every frame a pure function of `t`.
- Start from `templates/` (kinetic title, word-synced captions, stat counter, browser window, phone UI, chat thread, checklist reveal, cover still) before writing from zero.
- **3D** (`engines/hyperframes/three`, three.js) when depth carries meaning: a product to turn, a globe, a location in a city, a house, a pitch, a 3D chart. Templates: `product-turntable-3d`, `globe-arcs-3d`, `city-pin-3d`, `house-build-3d`, `pitch-tactics-3d`, `bars-3d`; presenters: `character-3d`, `photo-avatar`. 3D renders in software are slow: draft at `-q draft` first.
- **The voice is the clock.** Every entrance is cued from `audio/words.json`, never from a hand-typed frame number.
- Real logos and real screenshots in browser/phone frames. Mock UI with invented names or numbers must be disclosed at delivery.

### 10. Lint
Before every render, run what applies and fix every error:
```bash
npx hyperframes lint                                             # in each scenes/<id>/
node tools/textcheck.mjs videos/<slug>/scenes/<id>/index.html    # text cut off, overlapping, under platform UI
node tools/readcheck.mjs videos/<slug>/scenes/<id>/index.html --ignore caption   # every text stays long enough to read
npx tsc -p videos/<slug>/remotion                                # Remotion only
```
Also grep the scene code for `Math.random(`, `Date.now(`, `setTimeout(`, CSS `transition:`/`animation:` and `@keyframes` (non-deterministic or not frame-driven).

### 11. Dailies
Render stills at the start, middle and end of each scene, build a contact sheet, and **look at it**. Run the `qa-review` checklist. Fix, re-render only what changed, repeat until no FAIL. **G6.**

### 12. Independent critic
Spawn a fresh subagent that never saw the code or script, with `skills/qa-review/references/critic.md`. The author of a scene does not approve it. If no subagent is available, say so at delivery. **G7.**

### 13. Render
Render the master. For extra formats, the best result is a layout per format rendered separately; the quick path reframes the master (`fill` keeps the whole frame on a blurred bed, `crop` keeps a focus point):
```bash
node tools/export.mjs renders/<slug>-v1.mp4 --formats 1:1,16:9 --mode fill --out renders/
```

### 14. Loudness and safe areas
```bash
bash tools/loudness.sh measure renders/<slug>-v1.mp4
bash tools/loudness.sh normalize renders/<slug>-v1.mp4 renders/<slug>-v1-norm.mp4 -14   # only if off by more than 1 LU
node tools/textcheck.mjs videos/<slug>/scenes/cover/index.html --dump 0 --out qa/cover-boxes.json
python3 tools/cover_safe_area.py renders/cover.png --boxes qa/cover-boxes.json      # or --detect for a flat image
```
Social target −14 LUFS integrated, true peak ≤ −1 dBTP (−16 LUFS for platforms or clients that ask for it).

### 15. Deliver
Follow [delivery](references/delivery.md): MP4 + contact sheet + cover + caption/description, and an honest note (what is mock, what stayed WARN, who approved the look, whether the critic ran, what you could not verify, such as how the mix sounds). Revisions come by timestamp: find the scene, fix, re-check only that scene, re-render as `-v2`.

## Always
- Deterministic frames: seeded randomness, no wall clock.
- Paid steps only after a stated cost and an explicit yes. Keys come from environment variables (`ELEVENLABS_API_KEY`, `OPENAI_API_KEY`, …) and never appear in files, commands echoed to the user, logs or commits.
- No invented facts; no phrase from the banned list of the video language.
- Write big files in parts; keep a short decisions log at the end of `brief.md`.
