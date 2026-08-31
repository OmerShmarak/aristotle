# Skill: Architectural Diagrams (SVG.js)

Precise, restrained diagrams for explaining how buildings are arranged, assembled, supported, sealed, and serviced. The visual language comes from architectural drawing—plan, section, detail, and axonometric views—but its purpose is teaching, not producing contract documents.

## Renderer

```text
https://cdn.jsdelivr.net/npm/@svgdotjs/svg.js@3.2.8/dist/svg.min.js
```

SVG.js is included automatically by `build-book.sh` and the visual verifiers. It keeps the authoring API small while producing browser-native SVG: crisp at any size, inspectable by the collision verifier, and suitable for a controlled technical drawing style.

Reference documentation:

- [SVG.js 3.x documentation](https://svgjs.dev/docs/3.0/)
- [MDN: SVG from scratch](https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorials/SVG_from_scratch)

A complete section-and-axonometric smoke example lives at `skills/renderers/examples/architectural-diagrams-smoke.md`.

## When to use

Use this skill when the lesson depends on **physical arrangement or continuity**:

- a load, water, air, heat, or service path through a building;
- the vertical relationship among soil, footing, wall, floor, and roof;
- the layers at an enclosure or foundation interface;
- where openings, beams, columns, bracing, pipes, or ducts sit relative to one another;
- which pieces exist at each construction stage;
- a failure at a transition, penetration, joint, or missing connection;
- the difference between a cut element and something visible beyond it.

Prefer this over Rough.js when line weight, layers, alignment, or a literal physical interface carries the insight. Prefer a flow-chain diagram when the idea is only an abstract sequence. Prefer JSXGraph when exact mathematical geometry—not building anatomy—is the lesson.

## Choose the view before drawing

Every view answers a different kind of question. Pick one; do not default to a miniature complete set of architectural drawings.

| View | Use it to answer | Do not use it for |
|---|---|---|
| **Plan** | What sits beside what? Where does a route go horizontally? How do openings and supports align? | Vertical layers, foundations, roof-to-wall continuity |
| **Section** | What sits above what? How do loads or water cross levels and interfaces? What is cut versus behind? | Whole-floor circulation or a long horizontal route |
| **Detail** | What happens at one joint, penetration, edge, or layer transition? | Showing the whole building at unreadable scale |
| **Axonometric / exploded** | How do several planes or parts meet in 3D? In what order are they assembled? | Precise dimensions or dense labels |
| **Small multiples** | What changed between construction stages? | Animation added only for spectacle |

The default for teaching house construction is a **section**. It exposes ground, gravity, vertical stacking, enclosure continuity, and hidden layers in one controlled slice. Use an axonometric only when a section genuinely loses a three-dimensional relationship.

## First design the claim

Write one sentence completing: “After seeing this, the reader should notice ___.” Draw only the geometry needed to make that relationship visible.

Good claims:

- “The floor load has no jump: each arrow ends on the next supporting element.”
- “The drainage plane remains continuous even where the window interrupts the wall.”
- “The pipe must be placed before the slab makes this location inaccessible.”

Bad claims:

- “This is what a house looks like.”
- “Here are all the parts.”
- “The page needed a picture.”

## Visual grammar

Architectural diagrams communicate hierarchy through line and tone before labels.

### Line hierarchy

| Meaning | Treatment |
|---|---|
| Element cut by the viewing plane | 4–6 px dark stroke or solid poche |
| Visible profile / primary edge | 2–3 px dark stroke |
| Element beyond the cut | 1–1.5 px muted stroke |
| Hidden or future work | 1–1.5 px dashed stroke |
| Dimension, datum, or leader | 1 px muted stroke |
| Active teaching path | 3 px accent stroke with arrowhead |

If every edge is equally dark, the reader cannot tell what the view means. If color and line weight disagree, line weight wins.

### Palette

```javascript
const C = {
  ink: '#292a2d',
  muted: '#77736b',
  paper: '#faf8f4',
  cut: '#4b4c50',
  concrete: '#d7d3ca',
  timber: '#c9955d',
  soil: '#c7aa7b',
  insulation: '#e8c96c',
  membrane: '#3d7ea6',
  load: '#b6403a',
  water: '#2676a5',
  air: '#3b8f83',
  service: '#8a5aa6',
  highlight: '#d99a2b'
};
```

Use color to focus attention, not to imitate materials. Keep most geometry neutral and reserve one strong color for the chapter's active path. Never rely on color alone: combine it with arrows, dashes, line weight, or a label.

### Material indication

Use simplified fills or sparse patterns only when material identity changes the mechanism. Do not simulate realistic textures.

- Concrete: light gray fill with a dark cut edge.
- Timber: warm flat fill; optional single grain line at detail scale.
- Soil: warm tan stipple or diagonal pattern.
- Insulation: pale yellow fill or a restrained zigzag at detail scale.
- Membrane/control layer: one continuous colored line, exaggerated just enough to trace.

## Required HTML shape

The `.architecture-diagram` class makes the SVG collision verifier and screenshot tool discover the board. The element immediately before `.caption` must be the visual container so `verify-render.js` can find it.

Do not indent raw HTML in chapter Markdown; Pandoc will escape indented HTML.

```html
<div class="diagram-block">
<div id="arch-CNN-name" class="architecture-diagram" style="width:100%;max-width:680px;aspect-ratio:3/2"></div>
<div class="caption">A sentence saying what relationship to inspect—not merely naming the drawing.</div>
</div>

<script>
(function () {
  const host = document.getElementById('arch-CNN-name');
  if (!host) throw new Error('arch-CNN-name missing — Pandoc indentation?');
  if (typeof SVG === 'undefined') throw new Error('SVG.js did not load');

  const W = 680, H = 450;
  const draw = SVG().addTo(host).size('100%', '100%').viewbox(0, 0, W, H);
  draw.attr({
    role: 'img',
    'aria-label': 'Describe the teaching relationship in this architectural diagram',
    preserveAspectRatio: 'xMidYMid meet'
  });

  const C = { ink: '#292a2d', muted: '#77736b', paper: '#faf8f4', load: '#b6403a' };
  // Draw only what the claim needs.
})();
</script>
```

Use a unique `arch-CNN-name` ID per board. Keep a real aspect ratio on the host so responsive SVGs have a nonzero height.

### Phone-width strategy

The saved `-mobile.png` is a design test, not a box-check. A wide section with gutter labels can become technically responsive but practically unreadable when all of it shrinks to a phone screen. If the preview makes labels smaller than ordinary body text:

1. First crop harder or recompose the view vertically with a narrower `viewBox`.
2. If the spatial relationship genuinely needs the width, preserve readable scale and allow horizontal scrolling instead of shrinking indefinitely:

```html
<div class="diagram-block">
<div style="max-width:100%;overflow-x:auto">
<div id="arch-CNN-wide" class="architecture-diagram" style="width:680px;height:450px;max-width:none"></div>
</div>
<div class="caption">Tell the reader what relationship to inspect.</div>
</div>
```

The wrapper becomes the visual element discovered by `verify-render.js`; the inner `.architecture-diagram` remains discoverable by SVG collision checking and board screenshots. Horizontal scrolling is a fallback for irreducibly wide spatial views, not permission to keep unnecessary labels.

## Core SVG.js patterns

### Lines, shapes, and text

```javascript
draw.line(x1, y1, x2, y2).stroke({ color: C.ink, width: 2 });
draw.rect(w, h).move(x, y).fill(C.concrete).stroke({ color: C.ink, width: 4 });
draw.polygon([[x1,y1], [x2,y2], [x3,y3]]).fill(C.timber).stroke({ color: C.ink, width: 2 });
draw.path('M 20 40 C 80 10 120 70 180 40').fill('none').stroke({ color: C.water, width: 3 });

draw.text('floor diaphragm')
  .font({ family: 'Arial, Helvetica, sans-serif', size: 15, weight: 600 })
  .fill(C.ink)
  .move(40, 24);
```

Keep labels horizontal. Put them in open margins and use leaders; do not write across material fills or geometry. Shorten labels before shrinking type. Treat 13 px as the absolute floor at a 680-unit-wide viewBox.

### Arrowheads and active paths

```javascript
const arrowheads = new Map();

function arrowhead(color) {
  if (arrowheads.has(color)) return arrowheads.get(color);
  const head = draw.marker(10, 10, function (add) {
    add.path('M 0 0 L 10 5 L 0 10 z').fill(color);
  });
  head.attr({ orient: 'auto', refX: 9, refY: 5 });
  arrowheads.set(color, head);
  return head;
}

function arrow(x1, y1, x2, y2, color = C.load, width = 3) {
  return draw.line(x1, y1, x2, y2)
    .stroke({ color, width, linecap: 'round' })
    .marker('end', arrowhead(color));
}
```

An arrow represents one named process. Do not sprinkle arrows on every line. End a load arrow on the receiving element so continuity is visible.

### Patterns for cut material

```javascript
const soilPattern = draw.pattern(12, 12, function (add) {
  add.rect(12, 12).fill('#eadfc9');
  add.circle(1.6).center(3, 4).fill('#a98b61');
  add.circle(1.2).center(9, 9).fill('#a98b61');
});

draw.rect(680, 100).move(0, 350).fill(soilPattern);
```

Pattern definitions live in `<defs>` and are ignored by the collision verifier. A patterned region beneath a label is still a collision; put the label outside and lead to it.

### Leaders and collision-safe labels

```javascript
function leaderLabel(text, textX, textY, targetX, targetY, side = 'left') {
  const t = draw.text(text)
    .font({ family: 'Arial, Helvetica, sans-serif', size: 14, weight: 600 })
    .fill(C.ink)
    .move(textX, textY);

  const box = t.bbox();
  const endX = side === 'left' ? box.x - 7 : box.x2 + 7;
  const endY = box.cy;
  draw.line(targetX, targetY, endX, endY)
    .stroke({ color: C.muted, width: 1.2, linecap: 'round' });
  t.front();
  return t;
}
```

The leader stops before the text box. Keep labels outside teaching geometry even if a paper-colored plate could visually hide the overlap: the verifier deliberately checks the underlying relationship, not only the final paint order. Use `data-collision-ignore="true"` only for genuinely non-teaching container backgrounds or guides, never to silence real geometry.

### Dimensions and datums

Use dimensions only when relative size, clearance, slope, or alignment is the lesson. Do not invent realistic numbers that could be mistaken for design guidance.

```javascript
function horizontalDimension(x1, x2, y, witnessY, text) {
  draw.line(x1, witnessY, x1, y).stroke({ color: C.muted, width: 1 });
  draw.line(x2, witnessY, x2, y).stroke({ color: C.muted, width: 1 });
  draw.line(x1, y, x2, y).stroke({ color: C.muted, width: 1 });
  draw.line(x1, y - 5, x1, y + 5).stroke({ color: C.muted, width: 1 });
  draw.line(x2, y - 5, x2, y + 5).stroke({ color: C.muted, width: 1 });
  draw.text(text).font({ family: 'Arial, sans-serif', size: 13 })
    .fill(C.muted).center((x1 + x2) / 2, y - 11);
}
```

## Sections and details

Build a section in this order:

1. Establish ground or a datum.
2. Draw elements cut by the section with the heaviest profile.
3. Draw visible elements beyond with thinner lines.
4. Add the single active path or continuity line.
5. Place labels in an outer gutter, then add leaders.
6. Add a tiny orientation note such as “SECTION — NOT TO SCALE” when useful.

Crop aggressively. A foundation lesson may need one wall bay, not a whole house. A window lesson may need 600 mm of surrounding wall, not an elevation.

For a detail, exaggerate thin membranes and gaps so the mechanism is visible, and state “diagrammatic—not to scale” in the caption. Do not pretend a generic assembly is valid in every climate or jurisdiction.

## Controlled axonometric and exploded views

Use an orthographic axonometric rather than perspective so equal building parts stay equal in the drawing and stages can be compared without camera distortion. SVG.js does not need a 3D engine for simple assemblies; project a few world points into screen coordinates.

```javascript
const ISO = { ox: 330, oy: 350, x: 0.866, y: 0.5, z: 1 };

function iso(x, y, z) {
  return [
    ISO.ox + (x - y) * ISO.x,
    ISO.oy + (x + y) * ISO.y - z * ISO.z
  ];
}

function face(points, fill, stroke = C.ink, width = 1.6) {
  return draw.polygon(points.map((p) => iso(...p)))
    .fill(fill)
    .stroke({ color: stroke, width, linejoin: 'round' });
}

function isoBox(x, y, z, w, d, h, colors) {
  const p000 = [x, y, z],       p100 = [x+w, y, z];
  const p010 = [x, y+d, z],     p110 = [x+w, y+d, z];
  const p001 = [x, y, z+h],     p101 = [x+w, y, z+h];
  const p011 = [x, y+d, z+h],   p111 = [x+w, y+d, z+h];
  face([p000, p100, p101, p001], colors.front);
  face([p100, p110, p111, p101], colors.side);
  face([p001, p101, p111, p011], colors.top);
}
```

For an exploded view, move parts along one axis while retaining faint alignment guides. For construction stages, prefer two or three small multiples with the **same projection and scale**, gray existing work, and highlight only what was added. Do not allow orbit controls: a fixed author-chosen view keeps the explanatory relationship visible.

## Common failure modes

- **Miniature construction document:** Too many dimensions, symbols, rooms, and notes. Crop to the causal interface.
- **Generic infographic in disguise:** Rounded boxes standing in for real walls and slabs. If physical location matters, draw the physical section.
- **Everything outlined equally:** The cut plane becomes unreadable. Restore line hierarchy.
- **Photorealistic material colors:** They compete with the teaching highlight. Neutralize the building; color the active path.
- **Labels on top of geometry:** Move them into gutters and use leaders.
- **False universality:** A wall or foundation assembly is climate-, site-, code-, and system-dependent. Label conceptual details accordingly.
- **Fake precision:** Do not invent member sizes, reinforcement, slopes, or clearances unless sourced and essential.
- **Unstable intermediate state:** A staged erection diagram must show temporary bracing or state that it is omitted; otherwise it teaches an unsafe load path.
- **3D because it looks impressive:** If a section answers the question, use the section.

## Verification and visual QA

Run all four project verifiers:

```bash
node verifiers/verify-render.js          <breakdown-dir> <chapter.md>
node verifiers/verify-collisions.js      <breakdown-dir> <chapter.md>
node verifiers/verify-svg-collisions.js  <breakdown-dir> <chapter.md>
node verifiers/screenshot-boards.js      <breakdown-dir> <chapter.md>
```

`verify-svg-collisions.js` recognizes `.architecture-diagram` and checks its SVG text against drawing primitives. `screenshot-boards.js` saves both full-width and `-mobile.png` phone-width previews for architectural boards in `_board-previews/`; inspect both yourself. A clean collision report is only a floor.

Before shipping, check the preview at full width and approximately phone width:

- the claim is visible before reading the caption;
- cut/primary/secondary edges are distinguishable in grayscale;
- no label is smaller than the practical floor;
- labels do not overlap or clip;
- the important continuity path is unbroken;
- the diagram does not imply a universal or buildable detail when it is conceptual;
- the caption tells the reader what relationship to inspect.
