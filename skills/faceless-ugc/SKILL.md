---
name: faceless-ugc
description: Make videos without showing a real face, or UGC-style ad videos, by turning an avatar (a photo, an illustration or a 3D character) into a talking presenter - free and local (2.5D puppet, 3D character, kinetic type, hands/product only) or, with the user's own API key, through AI image-to-video and lip-sync providers (fal.ai, Wiro AI) or a lip-sync model they run themselves. Use when the user says faceless, no face, anonymous creator, avatar, talking photo, talking character, AI presenter, lip-sync, UGC, UGC ad, or wants a picture to speak a voice-over.
license: MIT
---

# Faceless and UGC videos

The viewer should get a presenter without anyone filming themselves. Pick the cheapest route that fits, keep the avatar on screen only as long as it helps, and never let it pass for a real customer.

Work inside the motion-director run (brief, script, voice, style, scenes, QA). This skill adds the avatar decisions and five gates:

| Gate | Passes when |
|---|---|
| F1 Route | the user picked a route (A-D) or accepted your recommendation |
| F2 Consent | a real person in the picture or voice has given documented consent (none needed for an original illustration or a code-built character) |
| F3 Honesty | the script has no invented testimonial, result or number, and the disclosure plan is written down |
| F4 Spend | route D only: the dry run was shown with models, seconds and estimated cost, and the user said yes |
| F5 Sync | `sync_check.py` passed (or its WARN is explained) and the stills were looked at |

## 1. Pick a route (F1)

| Route | What the viewer sees | Cost | Build with |
|---|---|---|---|
| **A. No face at all** | big voice-synced words, b-roll, real screens, hands or the product only | free | styles `kinetic-captions`, `screencast-zoom`, `unboxing-pop`, `before-after-split`, `product-hero-turntable`; templates `word-captions`, `kinetic-title`, `browser-window`, `phone-ui`, `product-turntable-3d` |
| **B. 3D character** | a stylised presenter built in code, mouth driven by the voice | free | `templates/character-3d` + `tools/mouth_curve.py` |
| **C. Photo or illustration avatar, local** | the user's cut-out photo or drawing as a 2.5D puppet: jaw, blinks, head sway | free | `templates/photo-avatar` + `tools/mouth_curve.py` (+ `tools/cutout.py`, `tools/avatar/landmarks.py`) |
| **D. AI avatar** | an AI-animated clip of the picture with model lip-sync: closest to filmed footage | paid per second (or free with a model on the user's own GPU) | `tools/avatar/avatar.py` (fal, wiro, local) |

Recommend in this order unless the brief says otherwise: A when the message is the screen or the product; C for a creator who wants a recognisable face without filming; B for a mascot or a series character; D when the result must look filmed and the user has a key and a budget. Say the choice and one reason.

## 2. Consent (F2)
- A picture of a real person is animated only with that person's **documented consent** (a message or signed note the user can show). Their own face: their consent is the request itself; record it in `brief.md`.
- Never animate a celebrity, a public figure, a customer, an employee, a stranger or anyone else whose consent the user cannot show, even "just for a test". Refuse and offer route A, B or an original illustration.
- Voice cloning: same rule, see `voice-and-timing`. A stock TTS voice needs no consent but is disclosed like the avatar.
- Original illustrations and code-built characters need no consent. Check that a commissioned drawing does not copy a real person or a protected character.

## 3. Script and honesty (F3)
Write the script with `script-and-hooks` as usual, then check these lines:
- An AI-generated or animated presenter is **disclosed** where the platform asks (AI-content label or toggle on TikTok, Instagram, YouTube and Meta ads; ad-platform policies on synthetic people). Write the plan into `brief.md`, e.g. "TikTok AI-generated label on; caption ends with 'AI avatar'".
- The avatar never pretends to be a customer, never says "I bought this and…" as if it were a real buyer, and never voices a testimonial, a result, a before/after or a number that nobody actually reported. Brand claims go in the brand's own voice ("we", "this serum has…") with a source on the claim list.
- Real customer quotes, photos or videos only with that customer's permission, word for word, with first name and city at most, and only claims they really made.
- Ad formats below that show "reactions" or "reviews" use the brand presenter, a product demo or a permitted real review: not an invented person.

## 4. Source picture and framing (routes C and D)
- Head and shoulders, facing the camera or slightly turned, **mouth closed and relaxed**, eyes open, neutral expression. An open mouth or a big smile in the source breaks both the puppet and most lip-sync models.
- Even, soft light from the front; no hard shadow across the mouth; no hand, hair, microphone or glasses rim covering the lips.
- At least 1080 px on the short side for route D; at least 1000 px wide for route C. Sharp, not beauty-filtered.
- Crop so the **hands are out of frame**: the bottom edge cuts at the chest; at most fingertips may show. Leave room above the head.
- Route C needs a cut-out (transparent background): `python3 tools/cutout.py face.jpg assets/cutout/ --auto-crop` (writes `0001.png`), or a drawing with a transparent background.
- Mouth fully visible in every frame: no captions or stickers over it. With the lower-card layout, captions go above the card (y ≤ 1000).

## 5. Voice and mouth curve
1. Voice from `voice-and-timing` (its own consent and cost gate applies). Paid TTS and paid avatar are separate yeses.
2. Mouth curve for routes B and C: `python3 tools/mouth_curve.py audio/voice.wav -o scenes/<name>/assets/mouth.json --fps 30`.
3. A scene that starts later in the voice-over reads the curve from that second: `voiceOffset` (photo-avatar) / `mouthOffset` (character-3d).

## 6. Build

### Route C: photo-avatar (free, local)
1. Landmarks in image pixels. Either look at the picture and type them (mouth centre on the line where the lips meet, mouth width, eye centres with width and opening height, chin), or, if MediaPipe is installed (`pip install mediapipe pillow`, optional, Apache-2.0):
   `python3 tools/avatar/landmarks.py detect assets/cutout.png -o values.json [--model face_landmarker.task]`
2. Always check them: `python3 tools/avatar/landmarks.py overlay assets/cutout.png values.json -o qa/landmarks.png` and look.
3. Add to `values.json`: `"image"`, `"mouthCurve": "assets/mouth.json"`, `"layout": "lower-card"` or `"full"`, `"duration"`, title text. Then:
   `engines/hyperframes/scripts/new-scene.sh avatar-intro --template photo-avatar --params values.json`
   Copy the cut-out and `mouth.json` into the scene folder at the paths you gave.
4. Render stills at a wide-open syllable and mid-blink; look at the mouth corners, above the upper lip and the eyelids. Tune `jaw`, `upperLip`, `openGain`, `teeth`, `motion`; set `"blinks": false` if a lid smears. Backgrounds come from the style (never a purple gradient or a grid).

### Route B: character-3d (free)
Scaffold `templates/character-3d` with `mouthCurve`, `layout`, cues for expressions and gestures (see its `params.json`). Same QA as C.

### Route D: AI avatar (paid or local model) — F4
1. `python3 tools/avatar/avatar.py check` — shows which keys are set (names only), whether `fal-client` and ffmpeg are present, and the provider it would pick: `MF_LIPSYNC_CMD` → `FAL_KEY` → Wiro keys → none (then fall back to route C and say so). Key setup and provider notes: [references/providers.md](references/providers.md).
2. Dry run (the default; sends nothing):
   `python3 tools/avatar/avatar.py talk --image assets/face.png --audio audio/voice.wav --out assets/avatar-d`
   It prints every step (animate clip, lip-sync chunks ≤ 10 s), the seconds, the estimated cost from `tools/avatar/pricing.json` with its "last checked" date, and which steps the cache already holds.
3. Tell the user, in their language: provider, models, seconds, estimated cost (say it is approximate and when the prices were checked), that retries cost again, and that a **5 s test first** is recommended (`--audio` cut to 5 s, `--clip 5`). Wait for an explicit yes. **F4.** Each later paid run needs its own yes unless the user approved a total.
4. Run the same command with `--yes`. Request ids and the estimate are kept in `job.json`; finished chunks are cached in `.mf-cache/avatar/` (add it to `.gitignore`), so a failed run resumes without paying twice (`--force` pays again).
5. Cheaper variants: `--base-video` with a photo-avatar render made with `"openGain": 0` (head motion and blinks, mouth closed) skips the paid animate step; `lipsync` alone works on footage the user owns. A local model (`--provider local`, `MF_LIPSYNC_CMD`) is free: the CLI prints the command it runs.
6. Wiro: the adapter is marked unverified. Before the first paid Wiro run, check the endpoint paths, header names, signature recipe and input field names in `providers.json` against Wiro's API docs, fill the model slugs and the price.

## 7. Where the avatar goes in the video
Most of the video stays graphics. The presenter opens and closes:
- **0-5 s:** avatar intro (lower-card layout, head popping out over the card, hook as the big title above). The hook sentence is spoken here.
- **middle:** graphics, screens, product, captions; the avatar is off screen (at most a small cut-back of ≤ 2 s if the story needs a reaction).
- **last ~5 s:** avatar outro with the call to action, a different clip or seed than the intro.
For the puppet render the intro and outro as two scenes (`voiceOffset` set to where each starts). For route D, run `talk` once per section, not on the whole voice-over: you pay for 10 s instead of 60.

## 8. UGC ad formats
Beats for 9:16, 15-30 s. "Presenter" = route B, C or D avatar or a permitted real creator; never an invented customer.

| Format | Beats | Build with |
|---|---|---|
| **Hook selfie** | 0-2 s presenter close, hook line + big text; 2-8 s the problem in one sentence over b-roll; 8-15 s product in use; 15-20 s presenter CTA | photo-avatar (full layout for the hook), `kinetic-title`, `word-captions`; style `talking-head-pop` or `creator-reels-dark` |
| **Problem → product in hand → result** | 0-2 s the problem shown (not told); 2-6 s hands bring the product in; 6-14 s using it, one claim per beat with source; 14-18 s the real result (real footage or before/after the brand can prove); 18-20 s CTA | route A (hands, product); `before-after-split`, `product-turntable-3d`; avatar only for the CTA |
| **3 reasons** | 0-2 s hook "3 reasons…"; 2-6 / 6-10 / 10-14 s one reason each with a numbered card and proof on screen; 14-17 s presenter CTA | `checklist-reveal`, `stat-counter` (sourced numbers only); avatar intro + outro |
| **Green-screen over a page or review** | 0-2 s presenter cut-out over a real page or a permitted review; 2-12 s zooms to the lines being talked about; 12-15 s CTA | photo-avatar `full` layout with `avatarScale` ~0.6 over `browser-window`; real screenshots only |
| **Split reaction** | top half: the thing (demo, unboxing, screen); bottom card: presenter reacting with short lines; 0-2 s the moment, then react, last 3 s CTA | photo-avatar `lower-card` + any top scene; style `ugc-testimonial` only for real reviews |
| **Unboxing** | 0-2 s the box arrives; 2-10 s flaps open, items rise one by one with labels; 10-14 s first use; 14-16 s presenter or end card CTA | style `unboxing-pop`, `product-turntable-3d`; avatar optional at the end |

## 9. QA (F5) and delivery
1. Lip-sync offset, every route (puppet, local, fal, wiro):
   `python3 tools/avatar/landmarks.py syncbox assets/cutout.png values.json` (route C: prints the mouth box) then
   `python3 tools/avatar/sync_check.py renders/avatar-intro.mp4 audio/voice.wav --mouth <x,y,w,h>`
   For route D results, pass the output twice (it carries the audio) and the mouth box measured on a still. PASS: |offset| ≤ 80 ms and correlation ≥ 0.3. A steady offset: shift the clip by that amount in the edit. Low correlation: fix the box, then look harder.
2. Stills at phone size (`tools/contact_sheet.py`): mouth corners, teeth (a hint, not a white bar), face sharpness (blur is the common lip-sync failure), eyes, edges of the cut-out, hands out of frame.
3. Run `qa-review` as usual.
4. Delivery note (add to motion-director's): which route, that the presenter is AI-generated or animated and how it is disclosed, the consent on file, provider + models + request ids + actual or estimated cost (from `job.json`), the `sync_check` result, and anything that stayed WARN.
