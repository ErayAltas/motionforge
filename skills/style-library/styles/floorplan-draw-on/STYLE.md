<!-- motionforge style · © 2026 motionforge contributors, MIT -->
# Floorplan Draw-On

> An architect's presentation plan on warm drafting vellum: walls trace and fill solid graphite, door swings arc open, and rooms take an ochre highlighter one by one with their name and area.

| Category | Engine | Best for | Effort |
|---|---|---|---|
| Real estate & maps | hyperframes (layered SVG); hyperframes + three.js for plan-to-volume | layouts of flats and houses, off-plan sales, renovation before/after, furniture fit | medium |

## 1. Essence
- In one sentence: understand how a home is laid out in twenty seconds, room by room in walking order.
- Three adjectives: legible, architectural, calm.
- Signature move: walls trace as outlines and then fill graphite in one sweep (poché); the active room floods with translucent ochre while its label and area stamp in.

## 2. Use it for / avoid it for
- Use for: listing layouts, off-plan apartments, renovations (removed walls dashed), "does a sofa fit", room-by-room explainers.
- Avoid for: machine or product anatomy (use `blueprint-schematic`), lifestyle-led premium homes (use `luxury-estate`), plans the user has no right to publish.
- Honesty: room names, dimensions and areas come from the user's plan or survey and say whether m² are net (usable) or gross; traced figures are marked "approx."; scale bar and north arrow are taken from the real plan. Architects' drawings are protected work: use the user's own or redraw from their measurements with permission.

## 3. Palette
| Token | Hex | Job |
|---|---|---|
| background | #F0ECE3 | warm drafting vellum |
| poché | #2B2926 | graphite wall fill |
| ink | #3A3733 | room labels, titles, dimension text |
| line-fine | #8C867C | furniture, fixtures, dimension lines (1.5 px) |
| accent | #E8A317 | ochre highlighter: active room fill at 32 %, active dimension |
| support | #7C9AA6 | glazing lines and outdoor areas (balcony, terrace hatch) |

Rules: one room carries ochre at a time; visited rooms return to vellum; labels never turn ochre (contrast), they stay ink on the tinted fill. Night variant: background #22211F, poché and lines #E9E4D9, same accent.

## 4. Type
- Display: Archivo (OFL) variable, 700, width 87.5, 92–112 px, uppercase, tracking 0.02 em.
- Body / captions: Archivo 600, width 100, 50–56 px, sentence case.
- Labels: room names Archivo 600 40–46 px uppercase, tracking 0.06 em; areas and dimensions Overpass Mono (OFL) 500 34 px ("14.6 m²") and 26 px along dimension lines.
- Language coverage: both ship latin + latin-ext; fallback `"Arial Narrow", sans-serif` and `ui-monospace`. Check ² and × glyphs; units follow the market (m² or sq ft), never both unless asked.

## 5. Surfaces and texture
- Background: flat vellum with large, soft paper-fibre noise (3 % luminance) and a 10 % corner vignette.
- Materials: graphite poché walls; 1.5 px fine lines for fixtures; double lines for windows; door swings as 1 px quarter arcs; 45° hatch only inside terraces; bathroom tile hatch only inside the room at 8 %.
- Texture: static grain 0.05; clean, ruler-straight strokes (no wobble).
- Never: blueprint blue (that belongs to `blueprint-schematic`), graph paper or a drawn backdrop grid, 3D renders mixed into the 2D plan in one frame.

## 6. Framing and layout
- 9:16 zones: title y 260–420; plan inside x 80–1000, y 480–1380, rotated so the long side runs vertical; north arrow and scale bar y 1400–1460 left; total chip ("Total 85 m² net") right, x ≤ 900; captions y 1500–1640.
- Other formats: 1:1 plan centred y 140–900, labels inside rooms only; 16:9 plan in the left 62 %, room legend ticking on the right.
- Density: plan + max 2 callouts + caption; labels appear only for rooms already visited.

## 7. Motion
- Entrances: outer walls stroke-dashoffset 1.2 s power1.inOut, clockwise from the entrance; inner walls 0.8 s; poché fills 0→100 % in 0.3 s once outlines close; windows 0.2 s each, 0.05 s stagger; door swings 0→90° in 0.35 s power2.out.
- Room beat: ochre clip-path wipes from the door inward 0.5 s power2.out; label stamps 1.12→1 in 0.25 s back.out(1.4); area counts up 0.6 s.
- Exits: highlight fades 0.3 s; the plan zooms back out 0.8 s power3.inOut.
- Holds and rhythm: 1.6–2.2 s per room; a three-room flat in 12–16 s.
- Transitions: doorway match cut: push into a doorway until it fills the frame, cut to footage shot from the same doorway.
- Camera: 2D push and pan only, scale 1→1.8 on the active room, 0.8 s power3.inOut; no rotation after the first frame.
- Frame rate feel: smooth 30 fps.
- Edit grammar: walk order follows the real path (entrance → living → kitchen → bedrooms → bath → outdoor); each room is one plan beat plus 1–2 footage shots of 1.2–2 s; cuts land on the spoken room name; L-cut carries the area sentence 0.4 s into the next plan beat; renovation before/after uses a 0.8 s vertical wipe with removed walls dashed in ochre.

## 8. Sound
- Bed: soft minimal piano-house or acoustic, 100–112 BPM, −27 LUFS under the voice.
- Effects: faint pencil scratch under wall draws (−22 dB), a soft paper tap per room stamp, a short wooden click on at most 3 door swings.
- Mix: voice first; final −14 LUFS integrated, true peak ≤ −1 dBTP.

## 9. Build recipe and checks
- Engine and templates: HyperFrames with a layered SVG (walls, openings, fixtures, labels); `hyperframes + three.js` with `templates/house-build-3d` when the plan should rise into a volume; `kinetic-title` opener, `stat-counter` for areas, `checklist-reveal` for the 16:9 legend, `word-captions`.
- Signature scenes:
  - Wall trace: entrance first, outer walls 1.2 s, inner 0.8 s, poché 0.3 s, doors open in walk order 0.08 s apart (new scene).
  - Room flood: ochre wipe from the door 0.5 s, label stamp back.out(1.4), "14.6 m²" counts with tabular digits (new scene + `stat-counter`).
  - Doorway match cut: push 1→2.4 into the doorway 0.8 s power3.in, hard cut to footage framed on the same opening (new scene).
  - Plan to volume: the finished plan tilts 55°, walls extrude to scaled 2.6 m over 1.4 s, roof settles power2.out (`house-build-3d`).
- Steps: 1) get the plan (PDF, DWG or photo) with permission and the official area table; 2) trace to SVG at real scale (1 px = 1 cm at master size) on separate layers; 3) script the walk order; 4) animate; 5) compare every number with the source, then `qa-review`.
- Style checks: areas match the source digit for digit and say net or gross; scale bar and north arrow correct; labels sit ≥ 24 px from walls; ochre never sits behind more than one room.
- Common failures: tracing a skewed phone photo (rectify first), doors swinging the wrong way, rooms too small for a label (use a leader outside), m² and sq ft mixed.

## Overrides
None in the library copy; project copies list their changes here.

## Credits
Original motionforge style, drawing on the general tradition of architectural presentation drawings with poché walls on tracing paper.
