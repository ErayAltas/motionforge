<!-- motionforge style · © 2026 motionforge contributors, MIT -->
# Cosmos Scale

> Black space with honest proportions: planets and stars at true relative size, a camera that pulls back one order of magnitude at a time, and amber counters that roll out kilometres and light-time.

| Category | Engine | Best for | Effort |
|---|---|---|---|
| Documentary & storytelling | hyperframes + three.js (canvas starfield) | astronomy, space missions, "how big is…", distance and light-time explainers | high |

## 1. Essence
- In one sentence: feel the size of things through exact comparison, not adjectives.
- Three adjectives: vast, exact, calm.
- Signature move: the camera pulls back ten times every 2.5 s while the counter in the corner rolls and the scale bar relabels itself.

## 2. Use it for / avoid it for
- Use for: planet and star comparisons, distances, missions, light-travel time, explaining a real telescope image.
- Avoid for: astrology, science fiction, topics that need people on screen.
- Honesty: sizes and distances come from a named source (space-agency fact sheets, published catalogues) shown on screen. Scale compromises (sizes and distances cannot both be true to scale) are fine and need no on-screen tag; keep the numbers themselves right. Check the licence of every telescope or mission image (many agency images are public domain, some are not; agency logos never).

## 3. Palette
| Token | Hex | Job |
|---|---|---|
| background | #03050A | deep space; light only near a star |
| ink | #E4EAF4 | titles and labels |
| accent | #FFB867 | sunlit amber: counters, scale bar, the "you are here" marker |
| support | #6E86A8 | orbit paths, secondary labels, leader lines |
| dim | #2A3446 | inactive orbits, far labels |

Rules: bodies keep their imaged colours; amber only on data overlays; no colourful backdrops unless a real image is the subject.

## 4. Type
- Display: Space Grotesk (OFL) 300 at 120–150 px, sentence case, tracking −0.02 em; 700 for one emphasised word.
- Counters: Space Mono (OFL) 700, 88–110 px, tabular, locale thousands separators; unit at 40 px in support.
- Labels: Space Grotesk 500, 30 px, uppercase, tracking 0.14 em, attached by 1 px leader lines.
- Fallback: Overpass Mono for counters, Hanken Grotesk for text. Load latin + latin-ext.

## 5. Surfaces and texture
- Background: seeded procedural starfield in 3 depth layers, points 1–2.5 px, brightness following a power law (few bright stars); stars do not flicker between frames.
- Bodies: three.js spheres with public-domain surface maps, one directional light from the Sun's real direction, a thin atmosphere shell only where one exists.
- Texture: static grain 0.04; a small bloom on the Sun only.
- Never: purple nebula gradients (house rule), lens-flare streaks over text, grid planes under planets, invented spacecraft UI.

## 6. Framing and layout
- 9:16 zones: title y 260–440; scene y 460–1460 centred on y 960; counter block x 80, y 1460–1600 (value, unit, "from Earth"); scale bar beside it, max 400 px; captions y 1620–1680 or merged into the counter block.
- Other formats: 1:1 counter bottom-left at y 900; 16:9 counter lower-left, scale bar lower-right, title top-left.
- Density: 1–3 labelled bodies, one counter, one scale bar.

## 7. Motion
- Entrances: bodies are never popped in — the camera finds them; labels draw their leader line in 0.3 s, then the text fades in 0.25 s.
- Exits: labels fade 0.3 s as the camera moves away.
- Holds and rhythm: 3–5 s per comparison; long takes of 6–15 s.
- Transitions: continuous logarithmic zoom (distance = d0·10^(t/T), T = 2.0–3.0 s per decade, power2.inOut in log space); cut only between topics with a 0.6 s dip to black.
- Camera: orbit 4–8°/s around a body; dolly in log scale; no shake.
- Frame rate feel: smooth 30 fps, motion blur off (it smears the stars).
- Edit grammar: few cuts; each decade change lands on a stressed number in the voice; speed changes happen inside the camera move, not as edit ramps; when the narration names a real telescope image, cut to it (2 % push, 4–6 s) and dissolve back in 0.8 s; counters move with the zoom, never ahead of it.

## 8. Sound
- Bed: slow ambient pads or drones, −30 LUFS, a low swell that rises with each zoom.
- Effects: soft digital ticks on counter digits (0.08 of voice), a deep sub swell when arriving at a body.
- Mix: voice first; −14 LUFS integrated, true peak ≤ −1 dBTP.

## 9. Build recipe and checks
- Engine and templates: hyperframes + three.js (scene in scaled units with a floating origin and logarithmic depth buffer), canvas for the starfield; `templates/globe-arcs-3d` for an Earth start shot; `stat-counter` for distance counters; `kinetic-title`; `word-captions`; `cover-still`.
- Signature scenes:
  - Decade pull-back: start at Earth, pull back one decade per 2.5 s; counter and scale bar ("1,000 km" → "10,000 km") update on every decade.
  - Size line-up: bodies sorted by radius on one line, each entering from the right in 0.6 s power3.out; Earth ringed in amber; ratio label (Sun vs Earth radius) from the cited source.
  - Light-time trip: a 6 px light pulse travels from the Sun to a planet at a stated time scale ("1 s = 1 min"); the counter shows real minutes and seconds.
  - Orbit trace: orbits draw as support ellipses in 1.2 s; planets move at correct relative angular speeds, sped up ×N.
  - You are here: amber marker with two rings pulsing on a deterministic 1.2 s sine as the camera pulls away.
- Steps: 1) number sheet with source per value; 2) decide which scenes are to scale; 3) build three.js scene and starfield seed; 4) render, counters, captions; 5) `qa-review` and claim check.
- Style checks: units consistent (km, AU, light-years) and locale-formatted; no star flicker on the contact sheet; radius vs diameter not mixed.
- Common failures: precision jitter at large distances (floating origin); textures of unclear origin; counters that run ahead of the picture.

## Overrides
None in the library copy; project copies list their changes here.

## Credits
Original motionforge style, drawing on the general tradition of astronomy documentaries and scale-comparison science films.
