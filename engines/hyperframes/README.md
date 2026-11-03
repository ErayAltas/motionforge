# HyperFrames engine (default)

HyperFrames turns an HTML page with a paused GSAP timeline into an MP4. It is the default
motionforge engine because it is free to use (Apache-2.0) and anything a browser can draw —
real UI, SVG, CSS 3D, three.js, video — becomes a frame.

```
engines/hyperframes/
├─ base.css            fonts (latin + latin-ext split), brand tokens, backdrop with static grain, text primitives
├─ mf-runtime.js       small helpers for templates: params block, timeline registration, L(), seeded RNG, text fit
├─ starter/            minimal seekable scene (index.html, hyperframes.json, meta.json)
├─ three/              optional three.js layer: mf-three.js helpers + README (3D scenes)
└─ scripts/new-scene.sh  copy the starter (or a template) into a new scene folder
```

## 1. One-time setup

```bash
npm i -D hyperframes gsap
npm i -D @fontsource/inter @fontsource/instrument-serif @fontsource/jetbrains-mono   # fonts (OFL), optional but recommended
npx hyperframes --version
```

Pin the HyperFrames version in `package.json` scripts (`npx --yes hyperframes@X.Y.Z render`) so a scene
renders the same way months later.

## 2. Scaffold a scene

```bash
engines/hyperframes/scripts/new-scene.sh intro-title                      # from the starter
engines/hyperframes/scripts/new-scene.sh stat --template stat-counter \
    --params my-stat.json                                                 # from templates/stat-counter
```

The script creates `scenes/<name>/` with `index.html`, `hyperframes.json`, `meta.json`, and an
`assets/` folder holding `base.css`, `mf-runtime.js`, `vendor/gsap.min.js` (copied from
`node_modules`) and `fonts/*.woff2` (copied from `@fontsource/*`). `assets/vendor/` and
`assets/fonts/` are git-ignored inside the scene: they are reproducible copies, not source.

**GSAP comes from npm, never from a CDN.** Renders often run offline or behind a proxy; a CDN
script that fails to load produces a silent, motionless video. GSAP is distributed under its own
license (free, including commercial use, but not an OSI open-source license); motionforge does not
redistribute it — every user installs it from npm.

## 3. The scene contract

* `#root` carries `data-composition-id`, `data-start`, `data-duration`, `data-width`, `data-height`.
* Every timed element has `class="clip"` plus `data-start`, `data-duration`, `data-track-index`.
* Exactly one paused timeline per composition, registered by id:

  ```js
  const tl = gsap.timeline({ paused: true });
  // ... tweens ...
  tl.set({}, {}, DURATION);              // pad to the composition length
  window.__timelines = window.__timelines || {};
  window.__timelines["main"] = tl;
  ```
* **Deterministic.** No `Date.now()`, `performance.now()`, `Math.random()`, CSS `animation`,
  SMIL `<animate>` or autoplaying `<video>` driven by wall time. Seeded randomness only
  (`MF.rng(seed)`). Seeking to any `t` must give the same frame.
* Static grain only (see `base.css`): animated noise makes every frame unique and multiplies the file size.

### Voiceover sync with `L(v)`

Word timings (`tools/word_timings.py`) are times on the *whole* voiceover. A scene that starts at
second 24.9 of the voiceover converts them with a local-time helper:

```js
const SCENE_START = 24.9;
const L = (v) => Math.round((v - SCENE_START) * 100) / 100;
tl.fromTo("#title", { opacity: 0 }, { opacity: 1, duration: 0.3 }, L(25.04));  // the word "fast" at 25.04 s
```

Keep the raw voiceover seconds in the code (not pre-subtracted numbers): when the voiceover is
re-generated you update `SCENE_START` and the word times, and every cue moves with them.

## 4. Check and render

```bash
cd scenes/intro-title
npx hyperframes lint                                   # structure + timeline checks
npx hyperframes render -o renders/intro-title.mp4      # see `npx hyperframes render --help` for quality/fps flags
```

Before rendering the final, look at stills and run the motionforge checks:

```bash
node tools/textcheck.mjs scenes/intro-title            # text cut off, overlapping, under phone UI
node tools/readcheck.mjs scenes/intro-title            # every text stays long enough to read
python3 tools/contact_sheet.py scenes/intro-title/renders/intro-title.mp4 --n 12
```

## 5. Embed the MP4 in a Remotion edit (optional)

Render the scene, copy it into Remotion's `public/` folder, and place it on the timeline:

```tsx
import { OffthreadVideo, Sequence, staticFile } from "remotion";

<Sequence from={Math.round(24.9 * fps)} durationInFrames={Math.round(5 * fps)}>
  <OffthreadVideo src={staticFile("video/intro-title.mp4")} muted />
</Sequence>
```

Render HyperFrames scenes at the same fps and size as the Remotion composition (1080×1920, 30 fps
by default) so frames line up one to one. Keep the voiceover in Remotion, not in the scene MP4.

## 6. 3D scenes (three.js)

A scene can add a full-frame WebGL canvas drawn with three.js (MIT, from npm). The canvas follows the
`hf-seek` event that HyperFrames sends for every frame; HTML text stays on the GSAP timeline.

```bash
npm i -D three@0.170.0
engines/hyperframes/scripts/new-scene.sh hero --template product-turntable-3d   # 3D templates add the layer
engines/hyperframes/scripts/new-scene.sh my3d --three                           # starter + three.js + import map
```

Contract, determinism rules, software-rendering budget, lighting presets, loading your own GLB models
and the checks: [three/README.md](three/README.md).

## 7. Pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| A few letters (İ, ş, ğ, ł, ő) look different from the rest | only the `latin` font file is loaded | declare both `latin` and `latin-ext` faces (as in `base.css`) |
| "i" uppercases to "İ" in an English word | `text-transform: uppercase` follows `lang` | wrap the word in `<span lang="en">` |
| Video is frozen / blank | GSAP failed to load (CDN, wrong path) | local `assets/vendor/gsap.min.js`; check the console in `npx hyperframes preview` |
| Frames flicker between renders | SMIL, CSS animation, `Math.random()` | move all motion onto the GSAP timeline; use `MF.rng(seed)` |
| Huge output file | animated grain or noise | static grain only |
| 3D canvas empty or frozen in the render | three.js from a CDN, no import map, or draw() not registered | `new-scene.sh --three`; `onSeek(draw, ready)` from `mf-three.js` |
| Gradient / italic text clipped at the right edge | `background-clip: text` has no room for the overhang | small `padding-right` (the `.accent-gradient` class does this) |
