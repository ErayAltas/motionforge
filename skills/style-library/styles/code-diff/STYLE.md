<!-- motionforge style · © 2026 motionforge contributors, MIT -->
# Code Diff

> A dark code editor where removed lines tint red and collapse, added lines open and type in green, and highlighter-yellow review pins explain why each change was made.

| Category | Engine | Best for | Effort |
|---|---|---|---|
| Tech, SaaS & AI | hyperframes | code reviews, refactors, bug-fix stories, "what changed in this PR", AI-written code | medium |

## 1. Essence
- In one sentence: a pull request read aloud by a patient reviewer.
- Three adjectives: precise, readable, candid.
- Signature move: a removed line strikes through and folds away while the replacement types into the gap, then a yellow pin drops on the gutter with a one-line reason.

## 2. Use it for / avoid it for
- Use for: bug fixes, refactors, security patches, performance changes, comparing human vs AI-written code, language feature tours.
- Avoid for: whole files (show hunks), non-developer audiences without a plain-language caption. Code comes from the user's real repository or PR; Blur tokens, keys, emails and internal hostnames.

## 3. Palette
| Token | Hex | Job |
|---|---|---|
| background | #16181D | field around the editor, soft top light #22252C |
| editor | #1C1F26 | editor panel |
| ink | #D6DAE0 | code text, titles |
| muted | #7D8590 | line numbers, comments, file path |
| added | #4CC38A on #183A2A | "+" glyph and added-line tint |
| removed | #F07178 on #3F1D24 | "−" glyph and removed-line tint |
| accent | #FFDA5E | review pins, comment bubbles, token boxes |

Rules: green and red only mean added/removed; the yellow accent is the reviewer's voice and is never used on code itself. Syntax colours are muted (max 3 hues plus ink) so the diff tints read first.

## 4. Type
- Display: Red Hat Display (OFL) 800, 84–104 px, sentence case, tracking −0.02 em.
- Code: Fira Code (OFL) 500, 34–38 px, line height 1.5, ligatures off so `!=` and `=>` read literally; max 38 characters per visible line.
- Comments and captions: Red Hat Display 600, 38–48 px.
- Labels: Fira Code 500, 24 px, file paths and "+3 −1" counters.
- Language coverage: both ship latin-ext on Fontsource; fallback ui-monospace, Menlo.

## 5. Surfaces and texture
- Background: flat field with static grain 0.04 (none inside the editor; code stays crisp); editor panel radius 28 px, 1 px border #2B2F38, shadow 0 30px 60px rgba(0,0,0,.4).
- Materials: file tab strip (64 px tall), gutter 90 px with line numbers, diff tint bars full width.
- Never: Matrix-style rain, glowing hacker green, drawn grid backgrounds, invented code shown as a real project's.

## 6. Framing and layout
- 9:16 zones: title y 260–420; editor x 60–1020, y 440–1140 (12 visible lines); comment bubble or caption y 1170–1490.
- Other formats: 16:9 uses split view (before | after, each 860 px wide); 1:1 shows 10 lines.
- Density: one hunk at a time; max 2 pins on screen.

## 7. Motion
- Entrances: editor rises 80 px + fade, 0.5 s power3.out; lines appear top-down 0.03 s stagger.
- Changes: removed line — tint fades in 0.25 s, strike line draws 0.3 s, then line height collapses 57 → 0 px in 0.35 s power2.inOut; added line — height opens 0 → 57 px in 0.3 s, text types at 40 chars/s, tint settles 0.2 s.
- Exits: editor drops 60 px and fades 0.3 s power2.in; pins shrink into the gutter 0.2 s.
- Holds and rhythm: one hunk per 3–5 s; a pin or highlight every 1.5–2 s.
- Transitions: file switch = new tab slides in 0.25 s power2.out and the content swaps under it; this is the cut.
- Camera: scroll 0.6 s power2.inOut to centre the hunk; punch-in 1.3× on a token for ≥ 1.2 s.
- Frame rate feel: smooth 30 fps; typing is stepped per character.
- Edit grammar: code-review walkthrough — average shot 3–5 s, one hunk per shot. Cuts are tab switches and land on the word naming the function or file. The voice starts the next hunk 0.4 s before the scroll lands (J-cut). No speed ramps or whips. Cutaways to a real test run or app capture 2 s, then back.

## 8. Sound
- Bed: low-key lo-fi or ambient, 80–92 BPM, −30 LUFS under the voice.
- Effects: soft key taps during typing (randomised from a seeded set), paper-fold tick on line collapse, gentle pop on pins.
- Mix: voice first; final −14 LUFS integrated.

## 9. Build recipe and checks
- Engine and templates: hyperframes; editor is a new scene; `kinetic-title` for chapter titles, `browser-window` for the real PR page, `word-captions` for plain-language captions, `cover-still`.
- Signature scenes:
  - Strike and replace: tint, strike, collapse, then open and type; the tab counter ticks "+1 −1".
  - Review pin: yellow pin drops on the gutter with back.out(2), bubble grows from it 0.3 s, 2 px leader line to a 3 px yellow underline on the token.
  - Token spotlight: all other lines dim to 35 %, a yellow box (radius 8 px) frames one token, punch-in 1.3× in 0.5 s power3.out.
  - Hunk jump: the `@@` header slides in, scroll 0.6 s to the next change.
  - Tests pass: a 220 px terminal strip slides up and prints the real test summary line.
- Steps: 1) export the real diff (`git diff -U2`); 2) choose ≤ 3 hunks, rewrap lines to ≤ 38 chars without changing meaning; 3) write one reason per hunk (≤ 10 words); 4) build and time to words.json; 5) render, textcheck, secret scan of every frame.
- Style checks: code is legible at 360 px wide; red/green also differ by "+"/"−" glyphs (colour-blind safe); no secrets in any frame.
- Common failures: too many lines on screen, ligatures confusing beginners, rewrapped code that no longer compiles (note it as "reformatted").

## Overrides
None in the library copy; project copies list their changes here.

## Credits
Original motionforge style, drawing on the general tradition of code review interfaces and programming screencasts.
