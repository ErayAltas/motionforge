<!-- motionforge style · © 2026 motionforge contributors, MIT -->
# Budget Infographic

> Friendly pastel icons on warm cream, a donut that splits into spending categories, bars that compare months, and a green savings counter that ticks up at the end.

| Category | Engine | Best for | Effort |
|---|---|---|---|
| Finance & money | hyperframes (SVG) | personal budgeting, saving plans, cost-of-living breakdowns, money tips | low–medium |

## 1. Essence
- In one sentence: money made calm and countable.
- Three adjectives: approachable, tidy, reassuring.
- Signature move: a neutral ring draws itself, splits into segments with small gaps, and the one category being discussed slides out of the ring in green while its share counts up.

## 2. Use it for / avoid it for
- Use for: monthly budgets, "where my salary goes", savings challenges, subscription audits, rule-of-thumb splits.
- Avoid for: investment performance or market news (use `market-terminal`), serious debt or hardship stories where pastel tones feel flippant. Figures come from the user; shares add up to 100 %; no promised returns.

## 3. Palette
| Token | Hex | Job |
|---|---|---|
| background | #FBF4EA | warm cream |
| ink | #2B2A33 | numbers, headlines, icon outlines |
| accent | #11A37F | the highlighted category, savings, "you keep" amounts |
| pastel-a | #F7C9B6 | second category fill, icon discs |
| pastel-b | #C7DAF2 | third category fill, icon discs |
| neutral | #E4DCCF | every other segment, empty bar tracks |

Rules: one green thing per frame; max three coloured categories plus "other" in neutral; never use red for spending (it reads as a warning); text is always ink, never pastel.

## 4. Type
- Display: Outfit (OFL) 700, 88–120 px, sentence case, tracking −0.02 em.
- Numbers: Outfit 700 with tabular figures, 140–200 px hero, currency symbol at 60 % size, muted.
- Body / labels: Atkinson Hyperlegible (OFL) 400/700, 40–48 px; small labels 30 px.
- Language coverage: both have latin-ext on Fontsource; fallback system-ui. Format currency and decimals for the viewer's locale (`Intl.NumberFormat`).

## 5. Surfaces and texture
- Background: flat cream with static grain 0.03 and a soft centre light (#FFFBF4).
- Materials: rounded cards (radius 36 px, white #FFFFFF, shadow 0 12px 30px rgba(43,42,51,.08)); icons are original line drawings, 6 px stroke, on 180 px pastel discs.
- Lines: 3 px ink rules; donut stroke 120 px with 6 px gaps.
- Never: drawn grid backdrops, stock coin piles, dollar-rain, 3D pie tilts that distort shares.

## 6. Framing and layout
- 9:16 zones: headline y 260–440; chart y 480–1140 (donut 640 px diameter centred); legend or icon row y 1160–1320; caption y 1340–1500.
- Other formats: 16:9 donut left, legend and numbers right; 1:1 donut 560 px with legend below.
- Density: one chart per screen, max 4 legend entries.

## 7. Motion
- Entrances: cards rise 60 px + fade, 0.45 s power3.out; icons pop scale 0.5 → 1, 0.35 s back.out(2), 0.08 s stagger.
- Donut: neutral ring draws 0.8 s power2.inOut, splits 0.3 s, the highlight segment slides out 24 px and turns green 0.3 s.
- Bars and counters: bars grow from zero 0.6 s power3.out, 0.06 s stagger; counters count up 1.0 s power2.out and land on the exact figure.
- Exits: labels fade 0.25 s power2.in before the chart changes.
- Transitions: the chart morphs into the next one (donut → bar, bar → counter) in 0.6 s power2.inOut rather than cutting.
- Holds and rhythm: one number per 2.5–4 s; hold every final number ≥ 1.5 s.
- Camera: static; a 1.1× push on the highlighted segment at most.
- Frame rate feel: smooth 30 fps, no motion blur.
- Edit grammar: infographic explainer — no footage A-roll; each scene is one chart; transitions are morphs that land on the number word. Real photos (rent, groceries, a bill the user owns) appear as 1.5 s inserts in a rounded card with a 3 % push. Cuts only between chapters, on a sentence end.

## 8. Sound
- Bed: light acoustic or soft marimba pop, 100–110 BPM, −28 LUFS.
- Effects: soft pop per icon, quiet tick on counters, warm chime on the savings total.
- Mix: voice first; effects ≈ 0.12 of voice; final −14 LUFS integrated.

## 9. Build recipe and checks
- Engine and templates: hyperframes with SVG; `stat-counter` for totals, `checklist-reveal` for action steps, `kinetic-title`, `cover-still`.
- Signature scenes:
  - Donut split: ring draws, splits, highlight slides out green, share counts to the exact %.
  - Envelope deal: category envelopes (300 × 200 px) deal from a stack, 0.1 s stagger, amounts written on them.
  - Savings jar: jar fills to the level with a damped wobble (0.6 s), "+€120 / month" counter beside it.
  - Three-way bar: one 960 px bar divides into needs / wants / savings with labels, presented as a common rule of thumb, not advice.
  - Month vs month: two bars, difference bracket with the delta in green or ink.
- Steps: 1) collect figures from the user (or plausible example figures); 2) check totals add up; 3) one takeaway per chart; 4) build and time counters to words.json; 5) QA.
- Style checks: shares sum to 100 %; every number legible at 360 px; green used once per frame.
- Common failures: too many categories (merge into "other"), pastel text with low contrast, currency format mismatched to the language.

## Overrides
None in the library copy; project copies list their changes here.

## Credits
Original motionforge style, drawing on the general tradition of friendly editorial infographics and personal-finance explainers.
