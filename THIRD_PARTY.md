# Third-party software used at run time

motionforge does **not** bundle any of the software below. Each item is installed by you (npm, pip, system package) when a job needs it, and stays under its own license. This list tells you what gets installed and which terms apply.

| Software | Used for | License | Notes |
|---|---|---|---|
| [HyperFrames](https://github.com/heygen-com/hyperframes) | default engine: HTML scenes → MP4 | Apache-2.0 | `npx hyperframes` |
| [GSAP](https://gsap.com) | timelines inside HyperFrames scenes and templates | GSAP Standard License | installed from npm (`npm i gsap`), never vendored. Read its terms; they restrict building a competing visual animation builder with it. |
| [Remotion](https://www.remotion.dev) | optional React engine (`engines/remotion`) | Remotion License | free for individuals, non-profits and for-profit companies with up to 3 employees; larger companies need a Remotion Company License. |
| [three.js](https://threejs.org) | optional 3D layer in HyperFrames scenes and the `*-3d` templates | MIT | installed from npm (`npm i three@0.170.0`); `new-scene.sh` copies the module and a few addons into the scene's git-ignored `assets/vendor/` |
| [world-atlas](https://github.com/topojson/world-atlas) | land shapes for `globe-arcs-3d` | ISC | data derived from [Natural Earth](https://www.naturalearthdata.com) (public domain); installed from npm |
| [topojson-client](https://github.com/topojson/topojson-client) | reads the world-atlas TopoJSON in `globe-arcs-3d` | ISC | installed from npm |
| [React](https://react.dev) | Remotion compositions | MIT | |
| [Playwright](https://playwright.dev) | canvas engine rendering, screenshots | Apache-2.0 | downloads its own Chromium |
| [FFmpeg](https://ffmpeg.org) | encoding, loudness, contact sheets, export | LGPL-2.1+ / GPL-2.0+ (depends on your build) | system install |
| [faster-whisper](https://github.com/SYSTRAN/faster-whisper) | word timings | MIT | models download on first use |
| [rembg](https://github.com/danielgatis/rembg) | talking-head cut-out | MIT | models download on first use; check each model's own license |
| [Pillow](https://python-pillow.org) | images in Python tools | MIT-CMU (HPND) | |
| [fontTools](https://github.com/fonttools/fonttools) | glyph coverage check | MIT | optional |
| [NumPy](https://numpy.org) | `mouth_curve.py`, `avatar/sync_check.py` | BSD-3-Clause | |
| [fal-client](https://pypi.org/project/fal-client/) | optional: fal.ai calls in `tools/avatar` | MIT | `pip install fal-client`; used only with your `FAL_KEY` after you approve the cost |
| [MediaPipe](https://github.com/google-ai-edge/mediapipe) | optional: automatic face landmarks (`tools/avatar/landmarks.py`) | Apache-2.0 | `pip install mediapipe`; the face landmarker model file is downloaded by you |
| [Kokoro](https://github.com/hexgrad/kokoro) | optional local TTS | Apache-2.0 | optional |
| [Inter](https://rsms.me/inter/), [Instrument Serif](https://github.com/Instrument/instrument-serif), [JetBrains Mono](https://www.jetbrains.com/lp/mono/) | default fonts in examples and templates | SIL Open Font License 1.1 | installed via `@fontsource/*` packages, not bundled |

Paid APIs (ElevenLabs, OpenAI, fal.ai, Wiro and others) are called only with your own key and only after you approve the stated cost. Their terms of service apply to what you generate.
