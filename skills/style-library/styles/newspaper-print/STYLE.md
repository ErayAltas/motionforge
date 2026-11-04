<!-- motionforge style · © 2026 motionforge contributors, MIT -->
# Newspaper Print

> A front page on grey-white newsprint: dense justified columns, a heavy serif headline the camera dives into, halftone photos, and blue copy-editor's pencil circling the sentence that matters.

| Category | Engine | Best for | Effort |
|---|---|---|---|
| News & commentary | hyperframes (canvas halftone pass) | news analysis, press roundups, historic front pages, op-eds, explaining one article | medium |

## 1. Essence
- In one sentence: reading the paper over an editor's shoulder.
- Three adjectives: dense, credible, editorial.
- Signature move: the camera dives from the full page into one column as a blue pencil circles a sentence and writes a margin note.

## 2. Use it for / avoid it for
- Use for: commentary on published stories, "what the papers said", historic front pages, weekly roundups, op-ed adaptations.
- Avoid for: live or breaking updates (use `breaking-ticker`), product promos, very young audiences.
- Honesty: never fake a real masthead or forge a real publication's page. Real articles appear as scans or screenshots from the user, with publication and date visible, quoted briefly and attributed. Illustrative pages use a fictional masthead. Historic pages only if public domain or licensed.

## 3. Palette
| Token | Hex | Job |
|---|---|---|
| background | #E2DED2 | newsprint, slightly grey, yellowing at the edges |
| ink | #151515 | text, headlines, rules, halftone dots |
| accent | #2F63C4 | copy-editor's blue pencil: circles, arrows, margin notes |
| support | #8A877E | secondary text blocks, column rules, captions |

Rules: the page is monochrome; the blue pencil is the only colour. Photos are ink halftones (or a duotone of ink and newsprint).

## 4. Type
- Headline: Playfair Display (OFL) 900, 120–170 px, leading 0.95, tracking −0.015 em; italic 900 for decks.
- Body columns: Gelasio (OFL) 400, 28–32 px at zoom, justified with hyphenation, 6–8 words per line.
- Kickers and labels: Libre Franklin (OFL) 800, 30 px, uppercase, tracking 0.12 em.
- Pencil notes: Kalam (OFL) 400, 44 px in accent.
- Fallback: Libre Caslon Display for headlines. All load latin-ext; Playfair and Libre Franklin add Cyrillic, Kalam adds Devanagari.

## 5. Surfaces and texture
- Background: newsprint fibre, edge yellowing, grain 0.08, faint show-through of the reverse page (mirrored text at 4 %).
- Halftone: round dots on a 6–8 px cell at 45°, 8 % dot gain, generated deterministically from image luminance.
- Print: ink density varies ±6 % (noise multiply), 1.5 px column rules, a fold crease at mid-page (2 px light/dark pair).
- Never: graph-paper backgrounds, grunge splatter, glossy shadows, lorem ipsum in a readable zoom.

## 6. Framing and layout
- 9:16 zones: full page scaled so the headline sits y 300–600 and three 300 px columns run y 620–1500; zoomed views show one column at 2.5×; caption clipping strip y 1500–1640 (Gelasio 600, 46 px).
- Other formats: 1:1 page fills the frame; 16:9 a two-page spread.
- Density: dense on the full page by design; zoomed scenes show one column and one pencil mark.

## 7. Motion
- Entrances: press roll — pages slide past vertically with motion blur for 0.6 s and stop on the page; halftone photos develop from a 24 px cell to 6 px in 0.8 s.
- Exits: page turn — 2D curl with a shadow sweep, 0.7 s power2.inOut; or a clipping lifts away (below).
- Holds and rhythm: 3–5 s per highlighted sentence.
- Transitions: page turn on the beat between stories; clipping lift into the next scene.
- Camera: dive from page (scale 1) to headline (2.2) in 1.2 s power3.inOut, then into a column (3.0) in 0.9 s.
- Frame rate feel: smooth 30 fps; pencil strokes drawn on ones.
- Edit grammar: editorial explainer — one claim per highlighted line, held while the voice reads it verbatim; camera moves start on the word before the quote so the line is still when it is read; related footage enters as halftone stills for 3–4 s; each story change is a page turn; no speed ramps.

## 8. Sound
- Bed: brushed drums and upright bass, 90 BPM, −30 LUFS.
- Effects: paper rustle on turns, pencil scratch on circles and notes, a short press rumble on the intro — 0.1–0.15 of voice.
- Mix: voice first; −14 LUFS integrated, true peak ≤ −1 dBTP.

## 9. Build recipe and checks
- Engine and templates: hyperframes with a canvas halftone pass; `browser-window` for online articles; `kinetic-title` restyled in Playfair; `word-captions` on the clipping strip; `cover-still` with the front page.
- Signature scenes:
  - Headline dive: page to headline to column in two eased moves, landing on the quoted sentence.
  - Pencil circle: a 0.5 s loose ellipse with grain along the stroke, an arrow to the margin (0.3 s), a note written at 16 chars/s.
  - Clipping lift: a column is cut out along a scissor edge, lifts with 3° rotation and a shadow, and becomes the next scene's card.
  - Halftone develop: a photo resolves from coarse to fine dots as the voice names it.
  - Two papers: two clippings from different publications side by side with dates; the pencil underlines the words that differ.
- Steps: 1) gather real clippings with publication and date, or write the user's own text for illustrative pages; 2) set columns; 3) halftone the photos; 4) camera keyframes from words.json; 5) `qa-review`.
- Style checks: every real clipping shows publication and date; fictional mastheads never resemble a real title; body text readable at zoom; blue only on pencil marks.
- Common failures: unreadable columns at zoom (use real text, set larger); a fake page passing as real; too many pencil marks on one view (two max).

## Overrides
None in the library copy; project copies list their changes here.

## Credits
Original motionforge style, drawing on the general tradition of print newspapers and newsroom copy-editing.
