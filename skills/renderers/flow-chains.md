# Skill: Flow Chains (Rough.js)

Hand-drawn vertical flow chains for showing linear dependencies: A → B → C → D. Uses Rough.js (already included by `build-book.sh`).

## CDN

None — uses Rough.js which is always included.

## When to Use

- Dependency chains: "concept A builds to B builds to C"
- Breakdown roadmaps: showing the chapter sequence and how topics connect
- Prerequisite chains: "you need X before Y before Z"
- Any linear progression the reader should see as a visual path

## When NOT to Use

- Complex diagrams with branching, feedback loops, or spatial layout (use conceptual-diagrams skill)
- Data/charts (use charts-and-graphs skill)

## Template

Just change the `items` array. Everything else auto-sizes.

```html
<div class="diagram-block">
<canvas id="flow-LNN-name" width="400" height="0"></canvas>
<div class="caption">How X builds to Y</div>
</div>

<script>
(function() {
  var items = [
    'Sound waves & frequency',
    'Why 12 notes',
    'Scales & keys',
    'Chords & progressions',
    'Full piece analysis'
  ];

  var canvas = document.getElementById('flow-LNN-name');
  var boxW = 280, boxH = 44, gap = 32, padX = 60, padY = 30;
  canvas.width = boxW + padX * 2;
  canvas.height = items.length * (boxH + gap) - gap + padY * 2;

  var rc = rough.canvas(canvas);
  var ctx = canvas.getContext('2d');

  items.forEach(function(text, i) {
    var x = padX, y = padY + i * (boxH + gap);

    rc.rectangle(x, y, boxW, boxH, {
      stroke: '#8b4513', fill: 'rgba(139,69,19,0.08)', fillStyle: 'solid', roughness: 1.2
    });

    ctx.font = "15px 'Comic Sans MS', 'Marker Felt', cursive, sans-serif";
    ctx.fillStyle = '#2c2c2c';
    ctx.textAlign = 'center';
    ctx.fillText(text, x + boxW / 2, y + boxH / 2 + 5);

    if (i < items.length - 1) {
      var ay = y + boxH, ay2 = ay + gap;
      rc.line(x + boxW / 2, ay, x + boxW / 2, ay2, {
        stroke: '#8b4513', strokeWidth: 1.5, roughness: 1
      });
      rc.line(x + boxW/2, ay2, x + boxW/2 - 6, ay2 - 8, { stroke: '#8b4513', strokeWidth: 1.5, roughness: 0.8 });
      rc.line(x + boxW/2, ay2, x + boxW/2 + 6, ay2 - 8, { stroke: '#8b4513', strokeWidth: 1.5, roughness: 0.8 });
    }
  });
})();
</script>
```

## Customization

**Wider boxes:** change `boxW` (default 280)

**Taller boxes (multiline text):** increase `boxH` (default 44)

**More spacing:** increase `gap` (default 32)

**Highlight a specific step:** change that box's stroke/fill color:

```javascript
var isHighlight = (i === 2);  // highlight the 3rd item
rc.rectangle(x, y, boxW, boxH, {
  stroke: isHighlight ? '#c0392b' : '#8b4513',
  fill: isHighlight ? 'rgba(192,57,43,0.12)' : 'rgba(139,69,19,0.08)',
  fillStyle: 'solid', roughness: 1.2
});
```

**Horizontal chain:** swap the x/y math — increment x instead of y, draw horizontal arrows.
