# Skill: Mathematical Geometry (JSXGraph)

Precise math constructions rendered as SVG. Use when the *insight is the geometry* and the coordinates must be right — projections, angles, ellipses, parametric curves. First-class LaTeX labels via KaTeX.

## CDN

```
https://cdn.jsdelivr.net/npm/jsxgraph@1.12.2/distrib/jsxgraphcore.js
https://cdn.jsdelivr.net/npm/jsxgraph@1.12.2/distrib/jsxgraph.css
```

Included automatically by `build-book.sh` — no manual setup needed. KaTeX is also loaded globally (already in every book), so `useKatex: true` on text just works.

## When to Use

- **Orthogonal projections & perpendiculars** — drop a foot from a point to a line without computing coordinates by hand. `perpendicularpoint` does the math.
- **Inner-product / angle geometry** — two vectors and the angle between them, with an arc marker and a KaTeX `$\theta$` label.
- **Covariance / level-set ellipses** — axis-aligned or rotated, drawn parametrically with exact semi-axes.
- **Function plots with annotated points** — `functiongraph` for $y = f(x)$ with highlighted points, tangents, areas.
- **Parametric & implicit curves** — spirals, Lissajous, whitening transforms visualized as deformations of the unit circle.
- **Any construction where the coordinates are computed, not eyeballed.** If you're about to type `t = vx*ux + vy*uy` into a Rough.js block, stop — use JSXGraph.

## When NOT to Use

- **Conceptual flows, feedback loops, boxes with arrows** — use `conceptual-diagrams.md` (Rough.js). JSXGraph's precise SVG feels sterile for those; hand-drawn warmth is the whole point.
- **Linear A → B → C → D chains** — use `flow-chains.md`.
- **Tabular or statistical data** (bars, pies, distributions) — use `charts-and-graphs.md` (Chart.js).
- **Sheet music** — use `music-notation.md` (VexFlow).
- **Decoration** — every diagram, math or not, must teach something prose cannot.

**Rule of thumb**: Rough.js for metaphor, JSXGraph for math. If the student's takeaway is "where those two things meet geometrically," use JSXGraph.

## Template

Use unique IDs per board: `jxg-CNN-concept-name` (the `jxg-` prefix tells the verifier this is an SVG board, not a canvas).

```html
<div class="diagram-block">
<div id="jxg-CNN-name" class="jxgbox" style="width:620px; height:400px; margin:0 auto;"></div>
<div class="caption">Description of what this shows</div>
</div>

<script>
(function() {
  var board = JXG.JSXGraph.initBoard('jxg-CNN-name', {
    boundingbox: [-1, 6, 9, -1],
    axis: false,
    showCopyright: false,
    showNavigation: false,
    keepAspectRatio: true,
    pan: { enabled: false },
    zoom: { enabled: false }
  });

  // Shared text defaults — spread into each text() call.
  var txt = { useKatex: true, parse: false, fixed: true };

  // Drawing code here
})();
</script>
```

**Defaults to keep**:
- `axis: false` — books render their own frame; axes look busy. Turn on (`axis: true`) only when the axes themselves are the content.
- `showCopyright: false`, `showNavigation: false` — the book is static, no UI chrome.
- `keepAspectRatio: true` — so a circle looks like a circle.
- `pan: { enabled: false }, zoom: { enabled: false }` — the reader should scroll the page, not the board.
- **`useKatex: true, parse: false` on every `text()` call** (the shared `txt` object above does this). Passing them per-element works reliably across JSXGraph versions; the global `JXG.Options.text.useKatex = true` has been flaky.
- `fixed: true` on every created element (points, arrows, text) — prevents drag. This is a book, not an app.
- `withLabel: false` on every invisible helper point (line endpoints, construction points). Otherwise JSXGraph renders auto-generated labels "A", "B", "C" on top of your diagram.

## API Quick Reference

### Points & lines

```javascript
board.create('point', [x, y], { name: 'P', fixed: true, size: 4, fillColor: '#2c2c2c' });
board.create('line', [pointA, pointB], { straightFirst: false, straightLast: true });   // ray
board.create('segment', [[x1,y1], [x2,y2]], { strokeColor: '#2c2c2c', strokeWidth: 2 });
board.create('arrow', [pointA, pointB], { strokeColor: '#8b4513', strokeWidth: 2.5 });
```

Points accept either literal coords `[x, y]` or references to other points / functions returning coords.

### Geometric constructions (the reason to use JSXGraph)

```javascript
var F = board.create('perpendicularpoint', [line, P], { visible: false });   // foot of perpendicular from P to line
board.create('perpendicular',   [line, P]);                                  // the perpendicular line itself
board.create('midpoint',        [A, B]);
board.create('reflection',      [P, line]);
board.create('intersection',    [line1, line2, 0]);                          // 0 = first intersection
board.create('parallel',        [line, P]);                                  // line through P parallel to `line`
```

### Measures

```javascript
board.create('angle', [A, B, C], {                // angle at B, from BA to BC
  radius: 0.6,
  name: '$\\theta$',
  type: 'sector',                                  // or 'square' for right-angle marker
  fillColor: '#c0392b', fillOpacity: 0.15,
  strokeColor: '#c0392b'
});
```

For a right-angle marker specifically, pass `type: 'square'` and a smaller `radius`.

### Shapes

```javascript
board.create('circle',  [centerPoint, radius_or_pointOnCircle]);
board.create('ellipse', [focus1, focus2, sumOfDistances]);                    // conic-section form
board.create('polygon', [[x1,y1], [x2,y2], [x3,y3]], { fillOpacity: 0.1 });
```

For a **covariance-style ellipse** with explicit semi-axes, use a parametric curve — it's easier than translating to foci:

```javascript
// Axis-aligned ellipse, semi-axes a and b
var a = 3, b = 1;
board.create('curve', [
  function(t) { return a * Math.cos(t); },
  function(t) { return b * Math.sin(t); },
  0, 2 * Math.PI
], { strokeColor: '#2980b9', strokeWidth: 2, fillColor: '#2980b9', fillOpacity: 0.08 });
```

### Curves

```javascript
board.create('functiongraph',   [function(x) { return x*x; }, -3, 3]);
board.create('parametriccurve', [function(t) { return Math.cos(t); },
                                 function(t) { return Math.sin(t); }, 0, 2*Math.PI]);
```

### Text (LaTeX)

```javascript
board.create('text', [x, y, '\\tilde x = x - \\bar x\\,\\mathbf{1}'], {
  useKatex: true, parse: false,
  fontSize: 14,
  anchorX: 'left',
  color: '#27ae60'
});
```

**Content is pure LaTeX — no `$...$` delimiters.** JSXGraph passes the content string straight to `katex.render()`, which parses bare math. Wrapping in `$` produces a `KaTeX parse error: Can't use function '$'`.

For mixed text that contains math *and* prose in one label (e.g. "Concrete example (n = 3):"), either split it into two `text` elements (one KaTeX, one plain) or just render the whole thing as plain text with `useKatex: false`.

Use `\\` inside JS string literals (to keep a single backslash in the TeX). Passing `useKatex: true` + `parse: false` explicitly on each text element is more reliable than the global `JXG.Options.text.useKatex = true` across JSXGraph versions.

## Color Palette (match the book)

| Use | Color |
|-----|-------|
| Default stroke | `#2c2c2c` |
| Accent / primary vector | `#8b4513` (saddle brown) |
| Projection / "level" piece | `#2980b9` (blue) |
| Orthogonal / "variation" piece | `#27ae60` (green) |
| Highlight / right-angle marker | `#c0392b` (red) |
| Muted / reference line | `#6b6b6b` (grey) |
| Construction helper / dashed | `#6b6b6b` with `dash: 2` |

Matches the palette used by `conceptual-diagrams.md` so JSXGraph and Rough.js diagrams sit next to each other cleanly.

## Style Guidelines

- **Every element `fixed: true`.** Static book, no dragging. Default JSXGraph UX is interactive; we want a finished picture.
- **Labels via LaTeX**, not plain strings. `$\\bar x\\,\\mathbf{1}$`, not `"x_bar * 1"`. Matches the prose typesetting.
- **Construction points invisible.** If a point exists only so you can reference it for a perpendicular or arrow, set `visible: false`. The reader sees vectors, not scaffolding.
- **Hide point names** unless they're load-bearing. `name: ''` on the origin, direction points, etc. Name only the things the caption talks about.
- **strokeWidth 2–2.5** for arrows and primary lines, 1.2–1.5 for dashed reference lines.
- **Size the board to content.** 620×400 is the default in the template; shrink to 480×320 for small insets, grow to 780×420 when you genuinely need horizontal room.

## Label Placement Principle

**Every vector label sits at the midpoint of its arrow, offset perpendicularly by ~0.5 board units, on the side facing away from the figure's interior.** Labels at arrow *tips* look floating; labels *on top of* arrows look broken. Midpoint + perpendicular offset reads as a proper annotation.

Formula for an arrow from `(x1, y1)` to `(x2, y2)`, side ∈ `{'left', 'right'}` (relative to walking along the arrow from start to end), distance in board units:

```
mid       = ((x1+x2)/2, (y1+y2)/2)
dir_unit  = (x2-x1, y2-y1) / length
perp_left = (-dir_unit.y,  dir_unit.x)      // 90° CCW rotation
perp_right= ( dir_unit.y, -dir_unit.x)      // 90° CW  rotation
label_pos = mid + distance * perp_{side}
```

Use the helper below rather than repeating this math per label.

### Helper: `labelAlongArrow`

Drop this near the top of each diagram's IIFE (copy-paste — it's tiny):

```javascript
function labelAlongArrow(board, from, to, content, side, distance, attrs) {
  // from, to   : [x, y] board coords of the arrow endpoints
  // side       : 'left' or 'right' relative to arrow direction
  // distance   : perpendicular offset in board units (0.5 is a good default)
  // attrs      : additional JSXGraph text attrs (color, fontSize, ...)
  var mx = (from[0] + to[0]) / 2;
  var my = (from[1] + to[1]) / 2;
  var dx = to[0] - from[0];
  var dy = to[1] - from[1];
  var len = Math.sqrt(dx * dx + dy * dy);
  var ux = dx / len, uy = dy / len;
  var px = (side === 'left') ? -uy :  uy;
  var py = (side === 'left') ?  ux : -ux;
  return board.create('text', [mx + distance * px, my + distance * py, content], Object.assign({
    useKatex: true, parse: false, fixed: true,
    anchorX: 'middle', anchorY: 'middle'
  }, attrs || {}));
}
```

**How to pick the side**: walk from `from` to `to` in your head. The side facing *away from the other elements* (origin, other arrows, the interior of the triangle) is correct. If in doubt, it's usually the side where there's empty space in the diagram.

For labels on **lines** (not arrows), the same formula works — pass the two points defining the line segment.

For labels on **points** (a single coord, not a segment), use `label: { offset: [dx, dy] }` on the point itself. Remember JSXGraph's label offset is `[px_right, px_UP]` — positive y means *up* on screen, not down.

## Common Patterns

### 1. Vector decomposition / orthogonal projection

The canonical "centering as projection" diagram. `perpendicularpoint` does the trigonometry; `labelAlongArrow` handles label placement. This is the polished reference — copy it as the starting point for any vector-decomposition diagram.

```javascript
(function() {
  function labelAlongArrow(board, from, to, content, side, distance, attrs) {
    var mx = (from[0]+to[0])/2, my = (from[1]+to[1])/2;
    var dx = to[0]-from[0], dy = to[1]-from[1];
    var len = Math.sqrt(dx*dx + dy*dy);
    var ux = dx/len, uy = dy/len;
    var px = (side === 'left') ? -uy :  uy;
    var py = (side === 'left') ?  ux : -ux;
    return board.create('text', [mx+distance*px, my+distance*py, content], Object.assign({
      useKatex: true, parse: false, fixed: true, anchorX: 'middle', anchorY: 'middle'
    }, attrs || {}));
  }

  var board = JXG.JSXGraph.initBoard('jxg-CNN-centering', {
    boundingbox: [-1.2, 6.6, 12, -1.4], axis: false,
    showCopyright: false, showNavigation: false, keepAspectRatio: true,
    pan: { enabled: false }, zoom: { enabled: false }
  });

  var O_coord = [0, 0], X_coord = [4.2, 5.4];

  board.create('point', O_coord, { name: 'O', fixed: true, size: 2.5, fillColor: '#2c2c2c', strokeColor: '#2c2c2c', label: { offset: [-14, 14], color: '#6b6b6b', fontSize: 14, useKatex: false, parse: false } });

  // Dashed span(1) segment — explicit endpoints keep it finite.
  var Lstart = board.create('point', [-0.7, -0.21], { visible: false, fixed: true, withLabel: false });
  var Lend   = board.create('point', [7.8,  2.34],  { visible: false, fixed: true, withLabel: false });
  var L      = board.create('line',  [Lstart, Lend], { strokeColor: '#b5b0a5', strokeWidth: 1.2, dash: 2, straightFirst: false, straightLast: false, withLabel: false });
  var X      = board.create('point', X_coord,       { visible: false, fixed: true, withLabel: false });
  var F_elem = board.create('perpendicularpoint', [L, X], { visible: false, withLabel: false });
  var F_coord = [F_elem.X(), F_elem.Y()];    // snapshot for labelAlongArrow math

  var arrowAttr = { strokeWidth: 2.5, lastArrow: { type: 1, size: 7 }, withLabel: false };
  board.create('arrow', [O_coord, X_coord], Object.assign({}, arrowAttr, { strokeColor: '#8b4513' }));  // x (raw)
  board.create('arrow', [O_coord, F_elem],  Object.assign({}, arrowAttr, { strokeColor: '#2980b9' }));  // x_bar · 1 (projection)
  board.create('arrow', [F_elem,  X_coord], Object.assign({}, arrowAttr, { strokeColor: '#27ae60' }));  // x_tilde (centered)
  board.create('angle', [X, F_elem, board.select('O') || O_coord], { type: 'square', radius: 0.32, strokeColor: '#c0392b', fillColor: '#c0392b', fillOpacity: 0.12, label: { visible: false }, withLabel: false });

  // Labels — each at midpoint + perpendicular offset on the "outside" of the triangle.
  labelAlongArrow(board, O_coord, X_coord, 'x',                                   'left',  0.55, { fontSize: 20, color: '#8b4513' });
  labelAlongArrow(board, O_coord, F_coord, '\\bar x\\,\\mathbf{1}',               'right', 0.55, { fontSize: 17, color: '#2980b9' });
  labelAlongArrow(board, F_coord, X_coord, '\\tilde x = x - \\bar x\\,\\mathbf{1}', 'right', 0.8,  { fontSize: 17, color: '#27ae60', anchorX: 'left' });

  // Secondary descriptors sit directly below each primary label.
  board.create('text', [2.85, -0.45, '(the level — all coords = mean)'], { useKatex: false, fixed: true, fontSize: 11, color: '#8a8677', anchorX: 'middle', anchorY: 'top' });
  board.create('text', [5.45,  3.15, '(pure variation, sums to zero)'],  { useKatex: false, fixed: true, fontSize: 11, color: '#8a8677', anchorX: 'left',   anchorY: 'middle' });
  board.create('text', [7.9,   2.0,  '\\mathrm{span}(\\mathbf{1})'],      { useKatex: true,  parse: false, fixed: true, fontSize: 14, color: '#8a8677', anchorX: 'left', anchorY: 'top' });
})();
```

### 2. Angle between two vectors with LaTeX label

```javascript
var O = board.create('point', [0, 0], { name: '', fixed: true, visible: false, withLabel: false });
var A = board.create('point', [4, 1], { name: '', fixed: true, visible: false, withLabel: false });
var B = board.create('point', [2, 3], { name: '', fixed: true, visible: false, withLabel: false });

board.create('arrow', [O, A], { strokeColor: '#8b4513', strokeWidth: 2.4, withLabel: false });
board.create('arrow', [O, B], { strokeColor: '#2980b9', strokeWidth: 2.4, withLabel: false });

board.create('angle', [A, O, B], {
  radius: 0.9, name: '\\theta',
  label: { useKatex: true, parse: false, fontSize: 16, color: '#c0392b', offset: [6, 10] },
  fillColor: '#c0392b', fillOpacity: 0.12, strokeColor: '#c0392b'
});

board.create('text', [4.1, 1.0, '\\tilde x'], { useKatex: true, parse: false, fixed: true, fontSize: 15, color: '#8b4513' });
board.create('text', [2.1, 3.2, '\\tilde y'], { useKatex: true, parse: false, fixed: true, fontSize: 15, color: '#2980b9' });
```

### 3. Covariance ellipse with principal axes

```javascript
// Axis-aligned ellipse, semi-axes a > b. Rotate by swapping cos/sin terms if you need tilt.
var a = 3, b = 1.2;

board.create('curve', [
  function(t) { return a * Math.cos(t); },
  function(t) { return b * Math.sin(t); },
  0, 2 * Math.PI
], { strokeColor: '#2980b9', strokeWidth: 2, fillColor: '#2980b9', fillOpacity: 0.08 });

board.create('arrow', [[0, 0], [ a, 0]], { strokeColor: '#8b4513', strokeWidth: 2, dash: 2 });
board.create('arrow', [[0, 0], [ 0, b]], { strokeColor: '#8b4513', strokeWidth: 2, dash: 2 });
board.create('text',  [a + 0.15, 0.2, '\\sqrt{\\lambda_1}'], { useKatex: true, parse: false, fixed: true, fontSize: 14, color: '#8b4513' });
board.create('text',  [0.15, b + 0.2, '\\sqrt{\\lambda_2}'], { useKatex: true, parse: false, fixed: true, fontSize: 14, color: '#8b4513' });
```

### 4. Function plot with highlighted point and tangent

```javascript
board.create('functiongraph', [function(x) { return x * x; }, -2.5, 2.5], {
  strokeColor: '#8b4513', strokeWidth: 2
});

var x0 = 1;
board.create('point', [x0, x0 * x0], { name: '', fixed: true, size: 4, fillColor: '#c0392b' });
// Tangent line: slope 2*x0 at x = x0
var slope = 2 * x0;
board.create('line', [[x0 - 1, x0*x0 - slope], [x0 + 1, x0*x0 + slope]], {
  strokeColor: '#2980b9', strokeWidth: 1.8, dash: 2, straightFirst: false, straightLast: false
});
board.create('text', [1.15, 1.0, '(1,\\,f(1))'], { useKatex: true, parse: false, fixed: true, fontSize: 13, color: '#c0392b' });
```

## Common Pitfalls

Aesthetic mistakes that pass the collision verifier but still look wrong:

- **Label at the arrow tip instead of midpoint.** Reads as floating. The eye doesn't know whether the label belongs to the arrow or to something else at that location. **Fix**: use `labelAlongArrow` — midpoint + perpendicular offset.
- **Label directly on top of its arrow.** Technically a collision, but easy to miss if the label is short and the arrow is colorful. **Fix**: perpendicular offset of at least 0.4 board units.
- **Label on the wrong side of the arrow** (the "inside" of a triangle formed by multiple arrows). Crowds the interior, leaves the exterior empty, and usually collides with other primitives. **Fix**: always place labels on the side *away from* the figure's other elements.
- **Secondary descriptor beside its primary instead of below.** Creates a wall of text. **Fix**: primary label at midpoint + perpendicular offset; secondary (`(pure variation...)` etc.) 0.5 board units directly below the primary, same horizontal anchor.
- **`$` delimiters inside `useKatex: true` content.** KaTeX sees `$` as a syntax error. **Fix**: content is pure LaTeX math — `'x'`, not `'$x$'`. If you need mixed prose + math in one label, split into two text elements or use `useKatex: false` with Unicode (x̄, x̃).
- **Mixed-case anchor spacing.** `anchorX: 'left'` on some labels and `'middle'` on others produces an alignment salad. **Fix**: pick `'middle'` for labels on arrows (they should center on the midpoint-perpendicular anchor point), pick `'left'` only for right-extending descriptive labels.
- **Helper points showing auto-labels "A", "B", "C".** JSXGraph names invisible construction points by default and still renders the labels. **Fix**: `withLabel: false` on every invisible / construction point.
- **Browser focus ring on a label** (dotted box around `x`). Fallout from JSXGraph's `tabindex="-1"`. **Fix**: already handled globally in `build-book.sh` CSS (`.JXGtext { outline: none !important; }`). Don't override.
- **Labels in sans-serif while the book is Georgia serif.** **Fix**: already handled in `build-book.sh` CSS; don't set `font-family` on labels explicitly.
- **`board.create('ellipse', ...)` for a covariance ellipse.** JSXGraph's `ellipse` takes foci, not semi-axes. **Fix**: use a parametric `curve` with `cos(t)` and `sin(t)` (see pattern 3).

## Before declaring the diagram done

Three-step checklist per diagram. Skip any step at your own risk — collision pass ≠ diagram good.

1. **Run all three verifiers and confirm they pass.**
   ```bash
   node {{PROJECT_ROOT}}/verifiers/verify-render.js          . chapters/NN-slug.md
   node {{PROJECT_ROOT}}/verifiers/verify-collisions.js      . chapters/NN-slug.md
   node {{PROJECT_ROOT}}/verifiers/verify-svg-collisions.js  . chapters/NN-slug.md
   ```

2. **Screenshot the board and look at the PNG.**
   ```bash
   node {{PROJECT_ROOT}}/verifiers/screenshot-boards.js . chapters/NN-slug.md
   ```
   Writes a PNG per board into `_board-previews/` inside the breakdown directory. Open it. Walk through the pitfalls list above and ask: "If I saw this in a textbook, would I believe it was professionally typeset?"

3. **Self-critique against the pitfalls list.** For each label, answer:
   - Is it at the midpoint + perpendicular offset of its referent, or floating at a tip?
   - Is it on the exterior side of the figure?
   - Does its secondary descriptor sit directly below it?
   - Does the `O` (or other point) label clear the dashed / construction lines passing through that point?

   If any answer is "no," fix it before moving on. Fixing placement after the book ships is much more expensive than fixing it now.

## Gotchas (technical)

- **Escape backslashes in JS string literals.** `'\\tilde x'` renders as `\tilde x` in KaTeX. A single `\` gets eaten by the JS lexer.
- **`parse: false` is usually what you want** when `useKatex: true`. JSXGraph's default text parser otherwise tries to recognize things like `(1)` as function calls and mangles them; `parse: false` passes the string straight through to KaTeX.
- **`keepAspectRatio` must stay on** if geometric relationships matter. Without it, a square could look like a rectangle depending on the board's box.
- **Label offsets are `[px_right, px_UP]`**, not `[px_right, px_down]`. Positive y means *up* on screen, which is the opposite of CSS convention. Easy to get wrong.
- **SVG output, not Canvas.** `verify-render.js` handles SVG fine. For label-overlap checks, the dedicated `verify-svg-collisions.js` is what runs against JSXGraph boards (the canvas-based `verify-collisions.js` skips them).
