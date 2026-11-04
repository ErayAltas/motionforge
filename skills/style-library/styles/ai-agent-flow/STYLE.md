<!-- motionforge style · © 2026 motionforge contributors, MIT -->
# AI Agent Flow

> A clean ink diagram on pale sage paper: agents as rounded nodes, tools as square chips, and violet pulses travelling along the edges as work is handed from one to the next.

| Category | Engine | Best for | Effort |
|---|---|---|---|
| Tech, SaaS & AI | hyperframes (SVG) or canvas | agent architectures, automations, tool-calling explainers, workflow builds | medium |

## 1. Essence
- In one sentence: you watch work move through a system, one handoff at a time.
- Three adjectives: legible, procedural, alive.
- Signature move: an edge draws itself, a violet pulse runs along it with a short fading trail, and the receiving node bumps as the pulse arrives.

## 2. Use it for / avoid it for
- Use for: "how my agent works", multi-step automations, tool calls and retries, RAG pipelines, before/after process redesigns.
- Avoid for: single-step tools (a screen capture is clearer), hype about "AI thinking". Agent names, tool names and outputs come from a real run or are plausible examples never presented as real results; tool and model logos only from the brand kit; never imply a product can do something it cannot.

## 3. Palette
| Token | Hex | Job |
|---|---|---|
| background | #EEF1EC | pale sage paper |
| node | #FFFFFF | node and chip fill |
| ink | #15201B | text, node outlines (3 px), active edges |
| accent | #6B3CF0 | violet: pulses, the active node ring, the current log line |
| support | #8A9A90 | idle edges, inactive nodes, muted labels |
| error | #C9472F | failed calls and retries only |

Rules: violet only moves or marks the current step; at most one violet node at a time. Dark variant: background #101613, node #18211C, ink #E6ECE8, accent #9B7BFF.

## 4. Type
- Display: Instrument Sans (OFL) 700, 84–110 px, sentence case, tracking −0.02 em.
- Body / captions: Instrument Sans 500, 46–52 px.
- Node and log labels: Martian Mono (OFL) 500, 26–30 px, lowercase for identifiers (`search_docs`), uppercase 22 px for role tags (AGENT, TOOL, MEMORY).
- Language coverage: both have latin-ext on Fontsource; fallback ui-monospace for labels.

## 5. Surfaces and texture
- Background: flat sage with static grain 0.04 and a 6 % vignette.
- Materials: agent nodes are pills (radius 999 px, min 240 × 96 px); tools are squarer chips (radius 16 px, 200 × 88 px); memory/data stores are drums (rounded-cap cylinders). Flat offset shadow 0 6px 0 rgba(21,32,27,.12).
- Lines: 4 px edges, orthogonal routing with 24 px corner radius, arrowheads 18 px; idle edges dashed 10/8.
- Never: dotted or squared canvas backgrounds, glowing brains, robot heads, purple gradients.

## 6. Framing and layout
- 9:16 zones: title y 260–420; graph y 460–1180, flowing top to bottom, max 4 rows; log card or caption y 1200–1500.
- Other formats: 16:9 graph flows left to right across x 120–1800; 1:1 uses a 3 × 3 layout max.
- Density: max 7 nodes visible; bigger systems are shown in zoomed sections.

## 7. Motion
- Entrances: nodes scale 0.8 → 1 + fade, 0.35 s, back.out(1.6), 0.07 s stagger in flow order; edges draw via stroke-dashoffset 0.5 s power2.inOut.
- Pulses: 14 px violet dot, 0.6 s per edge, power1.inOut, 120 px trail fading to 0; receiving node scales 1 → 1.06 → 1, 0.25 s.
- Exits: finished branches fade to support grey 0.4 s (they stay as context).
- Holds and rhythm: one handoff per 1.5–2.5 s; one step explained per 3–4 s.
- Transitions: none between graph scenes; camera moves carry the story.
- Camera: pans and zooms on the one canvas, 0.8 s power3.inOut, max 2.4×.
- Frame rate feel: smooth 30 fps.
- Edit grammar: explainer grammar on a single canvas — the "cut" is a camera move that lands on the word naming the next node. Average hold 3–4 s. Cutaways to the real terminal or log for 1.5–2 s, hard cut in and out, voice continuing (L-cut). No speed ramps; a retry is shown by replaying the pulse, not by fast motion.

## 8. Sound
- Bed: minimal pulse electronica, 96–110 BPM, −28 LUFS under the voice.
- Effects: soft blip per pulse arrival (pitch rises one step per hop), muted click when a node turns on, low buzz on error.
- Mix: voice first; effects ≈ 0.15 of voice; final −14 LUFS integrated.

## 9. Build recipe and checks
- Engine and templates: hyperframes with inline SVG (canvas for graphs over 20 nodes); `kinetic-title`, `word-captions`, `checklist-reveal` for summaries, `chat-thread` for user ↔ agent exchanges.
- Signature scenes:
  - Handoff pulse: edge draws 0.5 s, pulse travels 0.6 s, node bump 0.25 s, label under the edge types at 24 chars/s ("query → 12 docs").
  - Fan-out: the orchestrator sends three pulses to tool chips at 0.12 s stagger; each returns with a result chip ("200 OK", "3 rows").
  - Trace strip: a log card slides up under the graph 0.4 s power3.out; the violet line follows the pulse.
  - Node open: camera zooms 2.2× into a node, 0.8 s power3.inOut; the node unfolds into a card with a real prompt excerpt.
  - Retry loop: pulse hits a tool, edge flashes error red 0.2 s, pulse returns and goes again with a "retry 1/3" tag.
- Steps: 1) get a real run trace from the user; 2) reduce it to ≤ 7 visible nodes per scene; 3) lay out in SVG with fixed coordinates; 4) time pulses to words.json; 5) render and QA.
- Style checks: flow direction never reverses within a scene; every label readable at 360 px wide; only one violet node per frame.
- Common failures: spaghetti edges (re-route orthogonally, add rows), pulses faster than 0.4 s per edge (unreadable), invented tool outputs.

## Overrides
None in the library copy; project copies list their changes here.

## Credits
Original motionforge style, drawing on the general tradition of system diagrams and flowcharts in technical documentation.
