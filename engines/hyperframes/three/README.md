# three.js layer for HyperFrames scenes

A HyperFrames scene can hold a full-frame WebGL canvas drawn with [three.js](https://threejs.org)
(MIT). motionforge keeps it to one pattern: **the 3D canvas is driven by the `hf-seek` event, the HTML
text on top of it by the usual paused GSAP timeline.** Six ready templates use it:
`product-turntable-3d`, `globe-arcs-3d`, `city-pin-3d`, `house-build-3d`, `pitch-tactics-3d`, `bars-3d`
(see [templates/README.md](../../../templates/README.md)).

```
engines/hyperframes/three/
├─ README.md     this file
└─ mf-three.js   helpers: stage, lights, shadow floor, onSeek, orbit, easing, rng, project, GLB loading
```

## When to use 3D

Use it when depth carries the message: a product seen from several sides, a route on a globe, a place in
a city, a building that assembles, players moving on a pitch, a chart that should feel physical.
Stay in plain HTML/SVG for text, UI, screenshots and flat charts: they are sharper, faster to render and
easier to edit. A 3D shot that only spins is decoration; give the camera a reason to move.

## Setup

```bash
npm i -D three@0.170.0                                     # MIT
npm i -D world-atlas@2.0.2 topojson-client@3.1.0           # only for globe scenes (ISC; Natural Earth data)
engines/hyperframes/scripts/new-scene.sh hero --template product-turntable-3d   # 3D templates turn the layer on
engines/hyperframes/scripts/new-scene.sh my3d --three                           # starter + 3D layer
```

`--three` (automatic for 3D templates) copies into `assets/vendor/` (git-ignored, reproducible):
`three.module.min.js`, the addons `three-addons/{geometries/RoundedBoxGeometry, environments/RoomEnvironment,
loaders/GLTFLoader, utils/BufferGeometryUtils}.js`, and `mf-three.js`, and writes an import map so
`import ... from "three"` resolves to the local copy. **Never load three.js from a CDN**: a render that
cannot reach it produces an empty canvas without an error you will notice.

```html
<script type="importmap">{ "imports": { "three": "./assets/vendor/three.module.min.js", "three/addons/": "./assets/vendor/three-addons/" } }</script>
```

## The contract

```html
<div id="root" class="mf-stage" data-composition-id="main" data-start="0" data-duration="6" data-width="1080" data-height="1920">
  <canvas id="gl" class="clip" width="1080" height="1920" data-start="0" data-duration="6" data-track-index="0"></canvas>
  <h1 id="title" class="title clip" data-start="0" data-duration="6" data-track-index="1">…</h1>
</div>
<script>
  const tl = MF.timeline("main", 6);          // HTML layer: the registered, paused GSAP timeline
  tl.fromTo("#title", { opacity: 0 }, { opacity: 1, duration: 0.4 }, 0.2);
</script>
<script type="module">
  import * as THREE from "three";
  import { createStage, environment, lights, shadowCatcher, onSeek, orbit, ease, seg } from "./assets/vendor/mf-three.js";

  const { renderer, scene, camera, render } = createStage({ fov: 30 });   // transparent: CSS backdrop shows
  environment(renderer, scene, 0.5);
  lights.studio(scene);
  shadowCatcher(scene);
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#ddd" }));
  box.castShadow = true;
  scene.add(box);

  function draw(t) {                           // frame = f(t): set everything, then render once
    box.position.y = 0.5 + 2 * (1 - ease.outCubic(seg(t, 0.2, 0.8)));
    orbit(camera, { radius: 8, height: 2, angle: -30 + 10 * t, target: [0, 0.5, 0] });
    render();
  }
  onSeek(draw);                                // hf-seek on every frame + draw(0) at load
</script>
```

* HyperFrames dispatches `hf-seek` with `event.detail.time` (seconds) for every frame it captures.
  `onSeek(draw)` registers it and calls `draw(0)` once so the preview is not blank.
* Async assets (GLB, textures, map data, fonts drawn into canvases): pass a promise,
  `onSeek(draw, ready)`. Until it resolves each seek calls `event.detail.waitUntil(...)`, so HyperFrames
  waits instead of capturing an empty canvas.
* Want GSAP easing on 3D values? Build a **second** paused timeline (do not register it) and call
  `tl3d.seek(t)` inside `draw(t)` before `render()`.
* HTML labels that follow 3D points: place the camera, render, then `project(point, camera)` returns
  `{x, y, visible}` in CSS px of the full-frame canvas. Set `transform` on the label from there. Keep
  opacity/scale entrances either in `draw(t)` or on the GSAP timeline, never both on the same property.
* Frame the subject under the title with `camera.setViewOffset(1080, 1920, 0, -(targetY - 960), 1080, 1920)`:
  it moves the projection centre to screen y `targetY` without tilting the camera; `project()` follows it.

## Determinism

* No `requestAnimationFrame`, no `THREE.Clock`, no `Date.now()`/`performance.now()`, no `Math.random()`.
  Seeded randomness: `rng(seed)` (same generator as `MF.rng`).
* Everything that moves is a function of `t`. Repeating effects (pulses, spins) use `t` directly:
  `phase = ((t - start) % period) / period`.
* No physics, particles or simulations that integrate step by step; workers render frames out of order.
* Static grain only: a CSS grain layer above the canvas, never a noise shader that changes per frame.

## Performance budget (software rendering)

Renders usually run without a GPU: Chrome draws WebGL through SwiftShader on the CPU. It handles shadows
and tone mapping, but every pixel costs. The six templates (6–6.5 s, 1080x1920, 30 fps) took 1.5–4 minutes
each on a 4-core machine (bar chart fastest, city slowest); expect several times that when other renders
share the CPU.

| Item | Budget |
|---|---|
| Pixel ratio | `setPixelRatio(1)`, canvas exactly 1080x1920 (`preserveDrawingBuffer: true`) |
| Lights | ≤ 3; only the key light casts shadows |
| Shadow map | ≤ 2048, shadow camera fitted tightly (`size` option of the presets) |
| Triangles | tens of thousands, not millions; `InstancedMesh` for repeated objects (buildings, trees) |
| Textures | ≤ 4096 px on the long side; anisotropy ≤ 4–8 |
| Transparency | few large transparent surfaces; they are the slowest pixels |
| Post-processing | avoid (bloom, SSAO, DOF multiply the cost); fake glows with a fresnel shell or CSS |

## Lighting presets

`environment(renderer, scene, intensity)` adds soft image-based light from a neutral room (no file
needed); it is what makes metal, glass and glossy paint read as real. Then pick one preset:

| Preset | Use for | Lights |
|---|---|---|
| `lights.studio(scene, {size, target})` | products, charts, models on a plinth | warm key (shadows), cool fill, rim |
| `lights.daylight(scene, {size, target})` | cities, buildings, pitches | low warm sun (shadows), sky/ground hemisphere |
| `lights.night(scene, {size, target, warm})` | evening scenes | cool moon (shadows), dim ambient, one warm point light |

`shadowCatcher(scene, {opacity, y})` adds a floor that only shows shadows, so the canvas can stay
transparent and the motionforge backdrop (charcoal + soft top light + vignette, or paper) shows through.
Tone mapping: `"aces"` (filmic, default) for products, `"neutral"` when brand colours must stay exact.

## Your own models and textures

```js
const model = await loadGLB("assets/models/chair.glb");   // local file inside the scene folder
fitToSize(model, 2);                                      // largest side = 2 units, centred, standing on y = 0
scene.add(model);
```

* Keep models in `assets/models/`, textures in `assets/textures/`; load them with relative paths, never URLs.
  Prefer `.glb` (one file). Large models: decimate first (a few hundred thousand triangles at most).
* Textures from images: `new THREE.TextureLoader().loadAsync("assets/textures/wood.jpg")`, then set
  `texture.colorSpace = THREE.SRGBColorSpace` for colour maps (not for roughness/normal maps).
* An HDRI as environment needs the matching loader from `three/examples/jsm/loaders/` copied next to the
  other addons; the built-in `environment()` is usually enough.
* Where to find assets: CC0 model and HDRI libraries publish thousands of free assets. CC0 or not,
  **check each asset's licence on its page**, keep a copy of it, and record the asset, author, source URL
  and licence in `assets/CREDITS.md`. Brand products, logos and real buildings need the owner's permission.

## Checks before delivery

* Contact sheet (`python3 tools/contact_sheet.py renders/x.mp4 --n 12`): subject framed under the title,
  nothing important behind HTML text, labels on their anchors in every still.
* No flicker between seeks: render twice or extract the same frame from two renders and compare; any
  difference means something depends on wall time or on the previous frame.
* No z-fighting: coplanar surfaces (lines on the ground, decals) get a small y offset or
  `polygonOffset`; watch for shimmering stripes in the video, not just the stills.
* Text overlays are HTML (house fonts, crisp, translatable, checked by `textcheck.mjs`), not 3D text,
  unless the text has to sit in the scene (a number painted on a token, a sign on a building).
* Lint and look: `npx hyperframes lint`, then watch the MP4 at full size once.

## Voice-driven mouth

`tools/mouth_curve.py` turns a voice-over into a per-frame mouth curve that `templates/character-3d` and `templates/photo-avatar` read:

```bash
python3 tools/mouth_curve.py voice.mp3 -o scenes/<name>/mouth.json --fps 30
```

Format: `{"version":1,"fps":30,"duration":<s>,"open":[0..1 per frame],"shape":["closed"|"open"|"wide"|"round" per frame],"source":"<file>"}`. The templates load `mouth.json` with a request, so preview and render them through `npx hyperframes preview|render`, not by opening the file directly. Check the result with `python3 tools/avatar/sync_check.py out.mp4 voice.wav`.

Software rendering is slow for characters (about 2–2.5 s per 1080×1920 frame with shadows): use `-q draft`, short durations and `"shadows": false` while iterating.
