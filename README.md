<div align="center">

# motionforge

**Motion design videos, written in code by your coding agent.**

Describe the video. Your agent writes the hook and script, times every word to the voice-over, builds the scenes, renders, and checks its own work before you see it.

[English](README.md) · [Türkçe](docs/i18n/README.tr.md) · [Español](docs/i18n/README.es.md) · [Português (BR)](docs/i18n/README.pt-BR.md) · [Français](docs/i18n/README.fr.md) · [Deutsch](docs/i18n/README.de.md) · [简体中文](docs/i18n/README.zh-CN.md) · [日本語](docs/i18n/README.ja.md) · [한국어](docs/i18n/README.ko.md) · [हिन्दी](docs/i18n/README.hi.md)

![license](https://img.shields.io/badge/license-MIT-C8F53A?style=flat-square) ![agents](https://img.shields.io/badge/agents-Claude%20Code%20%C2%B7%20Codex%20%C2%B7%20Cursor-111317?style=flat-square) ![engine](https://img.shields.io/badge/default%20engine-HyperFrames-111317?style=flat-square) ![languages](https://img.shields.io/badge/languages-10-111317?style=flat-square)

</div>

<p align="center"><img src="docs/media/showcase.gif" alt="The 8 motionforge templates, rendered with HyperFrames" width="720"></p>

---

## What it does

You type something like:

> Make a 60-second vertical reel about the 5 free tools I use every day. Dark style, my voice, captions.

motionforge turns that into a checked MP4 through a fixed set of stages:

| Stage | What happens |
|---|---|
| **Brief** | The agent reads your request back in one sentence and asks only what is missing (format, length, language, voice). |
| **Hook & script** | 2–3 hook options, a script paced for speech, and a list of factual claims you should verify. No invented statistics. No stock "AI phrases" (banned lists in 10 languages). |
| **Voice** | Bring your own TTS key (ElevenLabs, OpenAI) or a local model. The agent states the cost and waits for your "yes" before any paid call. |
| **Timing** | Word-level timestamps from the voice-over, so every title, logo and caption lands on the word that is spoken. |
| **Style & brand** | Pick a look from the style library and apply your `brand.json` (colors, fonts, logo, watermark, outro). |
| **Scenes** | Built as seekable, deterministic code: HyperFrames (HTML + GSAP) by default, Remotion or a canvas engine when they fit better. |
| **QA** | Contact sheets, text overflow and safe-area checks, on-screen reading time, loudness, and a fresh-context critic that never wrote the scenes. |
| **Delivery** | MP4 in 9:16 / 1:1 / 16:9, a cover still, captions and a post description. Revisions by timestamp: "change the title at 0:12". |

## Install

### Claude Code (plugin)

```text
/plugin marketplace add aykutucesai/motionforge
/plugin install motionforge@motionforge
```

Then just ask for a video. The `motion-director` skill takes over.

### Codex, Cursor and other agents

```bash
git clone https://github.com/aykutucesai/motionforge
```

Open the folder (or add it to your project) and point the agent at [`AGENTS.md`](AGENTS.md). Every skill is plain Markdown with exact commands, so any agent that can read files and run a shell can follow it.

### Requirements

- Node.js 18+ (22 recommended) and ffmpeg
- Python 3.10+
- Optional: `faster-whisper` (word timings), `rembg` (cut-out of a talking head), `fonttools` (glyph checks), Playwright Chromium

The agent checks these at the start of a job and tells you exactly what to install.

## Try these prompts

```text
Turn this voice-over (voice.mp3) into a 9:16 reel. Kinetic captions, dark style, real logos for every product I mention.
```
```text
Make a 30-second product launch clip for my app from these 4 screenshots. Use my brand kit.
```
```text
Write 3 hook options and a 70-second script in Spanish about saving money on software. Don't generate audio yet.
```
```text
Here is a 10-second clip of me at my desk. Use the first 5 seconds as the intro and the last 5 as the outro, graphics in between.
```

## What's inside

See every template animated in [templates/README.md](templates/README.md).

```
motionforge/
├─ AGENTS.md                 entry point for any agent
├─ skills/
│  ├─ motion-director/       the full workflow and its approval gates
│  ├─ script-and-hooks/      hooks, scripts, claim list, banned phrases (10 languages)
│  ├─ voice-and-timing/      consent-gated TTS, word timings, captions, loudness
│  ├─ style-library/         100 looks in 20 categories, one STYLE.md each
│  ├─ brand-kit/             brand.json: colors, fonts, logos, watermark, outro
│  └─ qa-review/             checks + independent critic
├─ engines/
│  ├─ hyperframes/           default engine (HTML + GSAP, Apache-2.0)
│  ├─ remotion/              optional React engine + kit
│  └─ canvas/                frame = f(t) pages for hand-drawn and procedural looks
├─ templates/                ready scenes: kinetic title, captions, counter, browser, phone, chat, checklist, cover
│                            + 3D (three.js): product turntable, globe arcs, city pin, house build, pitch tactics, bars
└─ tools/                    word timings, cut-out, loudness, contact sheet, text check, export, cover safe area
```

## Principles

1. **Free for everyone by default.** The default engine, HyperFrames, is Apache-2.0. Remotion is optional (see [Licensing](docs/LICENSING.md)).
2. **Deterministic.** Every frame is a function of time. Same input, same video.
3. **Nothing paid without consent.** The agent names the cost first.
4. **Honest content.** Claims that need a source are listed for you; mock screens are disclosed.
5. **Checked before delivery.** If QA has an open failure, the video is not delivered.

## Languages

Skill instructions are written in English for agents. The agent talks to you in your language and writes scripts, captions and on-screen text in the video's language. Hook patterns and banned-phrase lists are native in:

English · Türkçe · Español · Português (Brasil) · Français · Deutsch · 简体中文 · 日本語 · 한국어 · हिन्दी

## Licensing

motionforge is released under the [MIT License](LICENSE). It calls third-party tools that keep their own licenses; see [THIRD_PARTY.md](THIRD_PARTY.md) and the plain-language guide in [docs/LICENSING.md](docs/LICENSING.md). In short: HyperFrames is Apache-2.0; GSAP is installed from npm under its own license; Remotion is free for individuals and companies with up to 3 employees and needs a company license above that.

## Contributing

Issues and pull requests are welcome: new styles, templates, language lists, engine improvements. Read [CONTRIBUTING.md](CONTRIBUTING.md) first.

---

<div align="center">

Made by <a href="https://www.instagram.com/aykutucesai/">Aykut Üçeş</a> · <a href="https://x.com/Aykutuces">@Aykutuces</a>

</div>
