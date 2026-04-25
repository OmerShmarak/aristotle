# Skill: Conceptual Diagrams (Rough.js)

Hand-drawn style diagrams for explaining abstract concepts — the "Wait But Why" / Tim Urban aesthetic. Sketchy, imperfect, friendly.

## CDN

```
https://cdn.jsdelivr.net/npm/roughjs@4.6.6/bundled/rough.min.js
```

Included automatically by `build-book.sh` — no manual setup needed.

## When to Use

- **Scale comparisons that break intuition** — when numbers are so different words fail (e.g., "10x higher concentration outside")
- **Counterintuitive patterns** — when something violates linear thinking (exponential curves vs linear projections)
- **Abstract temporal/spatial processes** — when causality unfolds in time/space in ways hard to track verbally
- **Comparative structure/anatomy** — when physical arrangement matters and components relate spatially
- **Causal chains with feedback** — when A→B→C→A and the loop is the insight

## When NOT to Use

- Simple lists (use prose or bullets)
- Linear sequences with no spatial component (use numbered steps)
- Facts that are already intuitive
- Decoration or "breaking up text" — every diagram must teach something prose cannot

**Rule of thumb**: If you can explain it clearly in one paragraph, don't draw it. Draw it only when the visual makes a non-obvious relationship suddenly obvious.

## Template

Use unique IDs per diagram (e.g., `diagram-L03-overtones`).

```html
<div class="diagram-block">
<canvas id="diagram-LNN-name" width="600" height="400"></canvas>
<div class="caption">Description of what this shows</div>
</div>

<script>
(function() {
  const canvas = document.getElementById('diagram-LNN-name');
  const rc = rough.canvas(canvas);
  const ctx = canvas.getContext('2d');

  function label(text, x, y, size, color) {
    ctx.font = (size || 14) + "px 'Comic Sans MS', 'Marker Felt', cursive, sans-serif";
    ctx.fillStyle = color || '#2c2c2c';
    ctx.fillText(text, x, y);
  }

  function arrow(x1, y1, x2, y2, color) {
    rc.line(x1, y1, x2, y2, { stroke: color || '#2c2c2c', strokeWidth: 1.5, roughness: 1.2 });
    var angle = Math.atan2(y2 - y1, x2 - x1);
    rc.line(x2, y2, x2 - 10 * Math.cos(angle - 0.4), y2 - 10 * Math.sin(angle - 0.4),
      { stroke: color || '#2c2c2c', strokeWidth: 1.5, roughness: 0.8 });
    rc.line(x2, y2, x2 - 10 * Math.cos(angle + 0.4), y2 - 10 * Math.sin(angle + 0.4),
      { stroke: color || '#2c2c2c', strokeWidth: 1.5, roughness: 0.8 });
  }

  // Drawing code here
})();
</script>
```

## Verifier-friendly defaults

The collision verifier checks whether drawn pixels exist underneath text labels. The most common failure pattern: a filled shape (especially Rough.js *hachure* fill) registers as drawing under a label placed inside or near the shape. After many sub-agent retrofits, here are the safe-by-default rules:

1. **Stroke-only by default.** Don't pass `fill` to `rc.rectangle / circle / ellipse / polygon` unless the fill is essential. A stroked outline never collides with labels in the way hachure or solid fills do.
2. **Labels go *outside* shapes, not inside.** If a box is labeled "Promoter," put the label above or below the box, not centered inside.
3. **If a label *must* go inside a filled shape**, paint a small white-ish background rectangle under the label first:
   ```javascript
   var w = ctx.measureText(text).width;
   ctx.fillStyle = '#faf8f4';     // page background color
   ctx.fillRect(x - w/2 - 4, y - 12, w + 8, 18);
   ctx.fillStyle = '#2c2c2c';
   ctx.fillText(text, x, y);
   ```
4. **Avoid `roughjs` `fillStyle: 'hachure'` near labels.** Sparse strokes register as drawings under text. Use `fillStyle: 'solid'` with low opacity, or skip fill.
5. **Comic Sans label width is unpredictable.** Leave 8–12 px of clearance around any label, not 4. Use `ctx.measureText(text).width` to get the actual width.
6. **Test once with a representative chapter** before shipping a new diagram pattern. The verifier catches collisions reliably; trust its output and adjust.

## API Quick Reference

### Shapes

```javascript
rc.rectangle(x, y, width, height, { stroke, fill, roughness, strokeWidth });
rc.circle(centerX, centerY, diameter, { stroke, fill, roughness });
rc.ellipse(centerX, centerY, width, height, { stroke, fill });
rc.line(x1, y1, x2, y2, { stroke, strokeWidth, roughness });
rc.arc(x, y, width, height, startAngle, endAngle, closed, { stroke, fill });
rc.polygon([[x1,y1], [x2,y2], [x3,y3]], { stroke, fill });
rc.path('M 10 10 L 100 100', { stroke, fill });  // SVG path syntax
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `roughness` | 1 | 0 = smooth, higher = sketchier |
| `stroke` | `'#2c2c2c'` | Line color |
| `strokeWidth` | 1 | Line thickness |
| `fill` | none | Fill color |
| `fillStyle` | `'hachure'` | Fill pattern: `'hachure'`, `'solid'`, `'zigzag'`, `'cross-hatch'`, `'dots'` |
| `fillWeight` | 0.5 | Weight of fill pattern lines |
| `hachureGap` | 4 | Gap between hachure lines |
| `bowing` | 1 | Amount of curve in lines |

### Canvas Text (via ctx, not rc)

```javascript
ctx.font = "14px 'Comic Sans MS', cursive, sans-serif";
ctx.fillStyle = '#2c2c2c';
ctx.textAlign = 'center';  // or 'left', 'right'
ctx.fillText('your text', x, y);
```

### Color Palette (warm earth tones)

| Use | Color |
|-----|-------|
| Default stroke | `#2c2c2c` |
| Accent / important | `#8b4513` (saddle brown) |
| Highlight | `#c0392b` (red) |
| Positive / good | `#27ae60` (green) |
| Info / neutral | `#2980b9` (blue) |
| Warning / energy | `#d4a017` (gold) |
| Muted / background | `#6b6b6b` |
| Light fill | `rgba(139, 69, 19, 0.1)` |

## Style Guidelines

- **Sketchy, imperfect** — that's the whole point. Roughness 1-2 is the sweet spot.
- **Comic Sans / Marker Felt** for labels — friendly, not formal
- **Warm earth tones** — avoid harsh primaries
- **Minimal elements** — fewer things, more white space
- **Informal annotations** — "(costs energy!)", "(this is the cool part)"
- **Arrows labeled with verbs** — "flows", "triggers", "maintains", "blocks"
- **Size canvas to content** — don't use 600x400 if 400x200 fits better

## Common Patterns

### 1. Process Flow (boxes + arrows)

```javascript
// Box with label
rc.rectangle(50, 50, 150, 60, { stroke: '#8b4513', fill: 'rgba(139,69,19,0.1)', fillStyle: 'solid' });
label('Input', 100, 85, 16, '#8b4513');

// Arrow to next box
arrow(200, 80, 280, 80, '#2c2c2c');

rc.rectangle(280, 50, 150, 60, { stroke: '#8b4513', fill: 'rgba(139,69,19,0.1)', fillStyle: 'solid' });
label('Output', 330, 85, 16, '#8b4513');
```

### 2. Comparison (side by side)

```javascript
// Left side
rc.rectangle(30, 40, 200, 120, { stroke: '#27ae60' });
label('Option A', 90, 30, 16, '#27ae60');
// ... draw contents

// Right side
rc.rectangle(280, 40, 200, 120, { stroke: '#c0392b' });
label('Option B', 340, 30, 16, '#c0392b');
// ... draw contents

// VS label
label('vs', 245, 105, 20, '#6b6b6b');
```

### 3. Feedback Loop

```javascript
// Three boxes in a triangle
rc.rectangle(200, 20, 120, 50, { stroke: '#8b4513' });  // top
rc.rectangle(50, 150, 120, 50, { stroke: '#8b4513' });   // bottom-left
rc.rectangle(330, 150, 120, 50, { stroke: '#8b4513' });  // bottom-right

// Arrows connecting them
arrow(260, 70, 110, 150);   // top → bottom-left
arrow(170, 175, 330, 175);  // bottom-left → bottom-right
arrow(390, 150, 300, 70);   // bottom-right → top (feedback!)

// Label the feedback arrow
label('feedback!', 360, 100, 14, '#c0392b');
```

### 4. Scale/Gradient

```javascript
// Gradient bar with labels at each end
for (var i = 0; i < 10; i++) {
  var shade = Math.floor(200 - i * 15);
  rc.rectangle(50 + i * 45, 80, 45, 40, {
    fill: 'rgb(' + shade + ',' + (shade - 50) + ',' + (shade - 100) + ')',
    fillStyle: 'solid', stroke: '#2c2c2c'
  });
}
label('Low', 50, 75, 14);
label('High', 460, 75, 14);
```

