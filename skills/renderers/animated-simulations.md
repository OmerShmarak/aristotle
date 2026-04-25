# Skill: Animated Simulations (p5.js)

Interactive, time-based simulations where motion *is* the insight. Particles, random walks, emergent behavior, live physics. When a still image can't carry the concept because the concept is a process.

## CDN

```
https://cdn.jsdelivr.net/npm/p5@1.9.4/lib/p5.min.js
```

Included automatically by `build-book.sh` — no manual setup needed.

## When to Use

- **Emergent behavior from simple rules** — when a reader needs to *see* that random motion + one constraint produces a pattern (diffusion, flocking, percolation, segregation models).
- **Processes whose shape is temporal** — something that only makes sense if you watch it unfold (wave propagation, action potentials, population dynamics, feedback oscillations).
- **Statistical intuitions that break without motion** — "why does net flow happen if every particle walks randomly?" is unanswerable as a still image. You have to watch.
- **Interactive parameter play** — when the insight is "what changes if you turn X up or down?" Let the reader turn the knob.
- **Counterintuitive scale/time effects** — exponential runaway, tipping points, phase transitions — visible only as motion.

## When NOT to Use

- Static relationships (use Rough.js conceptual diagrams)
- Data whose shape is the point (use Chart.js)
- Linear flow / dependency chains (use Flow Chains skill)
- Anything where a single snapshot conveys the whole idea — don't animate for decoration
- Anything requiring hundreds of thousands of particles — p5 is for ~100–2000 objects, not GPU-scale

**Rule of thumb**: If you can capture the concept in a single frame without losing anything, don't animate. Animate only when the passage of time is load-bearing for the insight.

## Core pattern: instance mode + parent div

Every simulation on a page must be in **instance mode** (not global) so multiple sketches coexist without stepping on each other.

```html
<div class="diagram-block">
<div id="sim-LNN-name" style="width:760px;"></div>
<div style="width:760px; display:flex; gap:10px; align-items:center; padding:8px 0; font-family: 'Comic Sans MS', cursive; font-size:13px;">
  <button id="sim-LNN-reset" style="padding:6px 14px; font-family:inherit; cursor:pointer;">Reset</button>
  <button id="sim-LNN-pause" style="padding:6px 14px; font-family:inherit; cursor:pointer;">Pause</button>
  <span id="sim-LNN-stats" style="margin-left:auto; color:#555;"></span>
</div>
<div class="caption">What the reader should watch for.</div>
</div>

<script>
window.addEventListener('load', function() {
  var sketch = function(p) {
    // ── state ──
    var particles = [];
    var paused = false;
    var W = 760, H = 440;

    function reset() {
      particles = [];
      // ... initialize
    }

    // ── lifecycle ──
    p.setup = function() {
      var c = p.createCanvas(W, H);
      c.parent('sim-LNN-name');
      reset();
      document.getElementById('sim-LNN-reset').onclick = reset;
      var btn = document.getElementById('sim-LNN-pause');
      btn.onclick = function() {
        paused = !paused;
        btn.textContent = paused ? 'Resume' : 'Pause';
      };
    };

    p.draw = function() {
      p.background(255, 248, 240);
      if (!paused) {
        // update particles
      }
      // render particles
      // update stats span
    };
  };
  new p5(sketch);
});
</script>
```

**Why instance mode matters**: global-mode p5 hijacks `window.setup`, `window.draw`, etc. Two sketches on one page = immediate collision. Always use `new p5(sketchFn)` with a parent div.

## API Quick Reference

### Lifecycle (on the `p` instance)

```javascript
p.setup = function() { ... };   // runs once
p.draw = function() { ... };    // runs every frame (~60fps)
p.mousePressed = function() { ... };  // optional interaction
p.createCanvas(W, H);           // must be first call in setup
p.frameRate(30);                // throttle if needed
p.noLoop();                     // stop draw loop (for static)
p.loop();                       // restart it
```

### Drawing

```javascript
p.background(255, 248, 240);           // clear + fill
p.fill(46, 80, 144, 210);              // r, g, b, alpha 0-255
p.stroke(139, 105, 20);
p.strokeWeight(1.5);
p.noStroke(); p.noFill();
p.circle(x, y, diameter);
p.ellipse(x, y, w, h);
p.rect(x, y, w, h);
p.line(x1, y1, x2, y2);
p.triangle(x1, y1, x2, y2, x3, y3);
p.arc(x, y, w, h, startRad, endRad);
p.point(x, y);
```

### Text

```javascript
p.textFont('Comic Sans MS');
p.textSize(14);
p.textAlign(p.CENTER);      // or p.LEFT, p.RIGHT
p.text('label', x, y);
```

### Color & math helpers

```javascript
p.random(a, b);              // uniform float [a, b)
p.noise(x, y);               // Perlin noise, smooth pseudo-random
p.map(val, a, b, c, d);      // linear remap
p.constrain(val, min, max);
p.dist(x1, y1, x2, y2);
p.lerp(a, b, t);
p.color(r, g, b, a);
```

### Interaction (optional)

```javascript
p.mouseX, p.mouseY       // current mouse position inside canvas
p.mouseIsPressed         // boolean
p.keyIsDown(p.UP_ARROW);
p.createSlider(min, max, start, step).parent('sim-LNN-name');
```

## Style Guidelines

- **Calm, warm background** — `p.background(255, 248, 240)` matches the Rough.js earth-tone palette.
- **Comic Sans labels** to match other diagrams.
- **Semi-transparent fills** for particles (`alpha 180–220`) so overlap stays readable.
- **Always provide Reset and Pause** — readers need to rerun and inspect.
- **Always show live stats** — a counter of "how many / where / what's net" makes the invisible claim visible.
- **Write a caption** explaining what to watch for. Motion without a prompt is noise.
- **Size canvas modestly** — 760×440 is the standard width matching other book diagrams. Don't go bigger without reason.
- **Frame rate**: default 60fps is fine for <500 particles. Drop to 30 with `p.frameRate(30)` if things lag.

## Common Patterns

### 1. Random walkers (the diffusion demo)

```javascript
var particles = [];
for (var i = 0; i < 150; i++) {
  particles.push({ x: p.random(W), y: p.random(H) });
}
p.draw = function() {
  p.background(255, 248, 240);
  for (var i = 0; i < particles.length; i++) {
    var pt = particles[i];
    pt.x += (Math.random() - 0.5) * 3;
    pt.y += (Math.random() - 0.5) * 3;
    pt.x = p.constrain(pt.x, 0, W);
    pt.y = p.constrain(pt.y, 0, H);
    p.noStroke();
    p.fill(46, 80, 144, 210);
    p.circle(pt.x, pt.y, 8);
  }
};
```

### 2. Wall / barrier with a single opening

```javascript
var wallX = 380, wallHalf = 6, gapY = 220, gapHalf = 22;

// draw
p.fill(210, 180, 140); p.noStroke();
p.rect(wallX - wallHalf, 0, wallHalf * 2, gapY - gapHalf);
p.rect(wallX - wallHalf, gapY + gapHalf, wallHalf * 2, H - (gapY + gapHalf));

// collision when updating a particle
var tryingToCross = (wasLeft && nx > wallX - wallHalf) || (!wasLeft && nx < wallX + wallHalf);
if (tryingToCross && Math.abs(ny - gapY) < gapHalf) {
  // passes through — allow move
} else if (tryingToCross) {
  // bounce: clamp back to the side it was on
  nx = wasLeft ? wallX - wallHalf - 1 : wallX + wallHalf + 1;
}
```

### 3. Live counter / stats

```javascript
var statsEl = document.getElementById('sim-LNN-stats');
// ...inside draw, after updating particles:
if (statsEl) statsEl.textContent = 'Left: ' + leftCount + '  Right: ' + rightCount;
```

### 4. Interactive slider

```javascript
// in setup
var slider = p.createSlider(0, 100, 50, 1);
slider.parent('sim-LNN-name');
slider.style('width', '200px');

// in draw
var val = slider.value();
// use val to change behavior live
```

### 5. Spring/oscillator (for waves, spike propagation)

```javascript
// each particle has x (position) and v (velocity)
var k = 0.1;   // spring stiffness
var damp = 0.98;
for (var i = 0; i < ps.length; i++) {
  var q = ps[i];
  var force = -k * (q.x - q.rest);   // restoring force
  q.v = (q.v + force) * damp;
  q.x += q.v;
}
```

### 6. Pause/reset buttons (always include)

Shown in the template above. Treat these as mandatory — never ship a sketch without them.

## Continuous vs reactive animations

Two styles, pick the right one:

- **Continuous** — `p.draw` runs every frame, particles move on their own. Reader sees motion the instant the page renders. Use for: diffusion, oscillators, particle flow, anything where the *invariant* (e.g., "net zero flow but particles still move") emerges from continuous motion.
- **Reactive** — animation only progresses when the user clicks a button (Trigger / Step / Reset cycle). Default state is a static "before" frame; the user has to actively kick off the demo. Use for: discrete-step processes that don't repeat (Cre/lox cutting once, AAV infecting once, an enzyme cycling once).

**Trap:** if you build a reactive animation, the page initially looks dead. Many readers won't realize there's a button to push. Either:

1. **Add a one-time auto-trigger** that fires the demo once, ~1 second after load, so the reader sees motion immediately. Then they can Reset and replay.
2. **Loop the demo** — when the demo state machine reaches "done," wait a couple of seconds and auto-Reset → auto-Trigger.
3. At minimum, **add a hint label** on the canvas at startup: "👆 click Trigger to play."

Default to option (1) or (2) unless there's a strong reason to make the reader work. A static-looking canvas reads as "broken."

## Verifier-friendly patterns (collision verification)

The collision verifier intercepts every `fillText` call across a 2-second render window, accumulating *all* text positions visited during animation. It then re-renders without text and checks for drawn pixels under any of those accumulated positions. Two consequences:

1. **Static label regions, moving particle regions** — keep all `p.text(...)` calls at *fixed* positions (status panel, axis labels, legend). Don't draw text *on* moving particles, because every visited position becomes a collision candidate.
2. **Don't draw shapes under fixed labels** — establish a "label zone" (top or bottom of the canvas) that drawings never enter.

If a particle absolutely needs a label, draw the label at the particle's *initial* position and a small leader line out to the moving particle. The label's text doesn't move; the line moves.

## Verifier-friendly patterns (render verification)

`verify-render.js` waits 2 seconds after `networkidle0` before screenshotting. Reactive animations that haven't run yet may still register as "rendered" if your initial frame draws *something* (background + a "before" state with labels and a placeholder). If your initial frame is just `p.background(...)` and nothing else, the verifier sees a uniform color and reports the visual as blank. **Always draw the initial frame as a meaningful "before" state, not an empty canvas.**

## Common Pitfalls

- **Global mode collision** — two sketches on one page both using global mode will silently overwrite each other's `draw`. Always use instance mode.
- **Forgetting to parent the canvas** — `p.createCanvas(...).parent('your-id')` is required, otherwise p5 appends the canvas to `document.body` and your layout breaks.
- **Reactive demo with no hint** — the page looks dead until the reader stumbles onto the button. Auto-trigger or auto-loop instead. See "Continuous vs reactive" above.
- **Initial frame is just the background color** — verify-render sees uniform pixels and flags it as not-rendered. Always paint a meaningful "before" state.
- **Drawing labels at moving positions** — collision verifier records every visited position as a label location, then finds drawings beneath them all. Keep label positions fixed.
- **Running forever at 60fps when paused** — check `paused` at the top of `draw` and skip updates. Don't skip rendering (the canvas will go blank).
- **Too many particles** — p5 slows past ~2000 visible objects. If you need more, switch to PixiJS or move to a Chart-style aggregate view.
- **Animations that look random** — if the "insight" only appears after 30 seconds, no one will wait. Tune step size, particle count, and starting conditions so the effect is visible within 5–10 seconds.
- **No stats** — a random-walk sim is unconvincing without a running count. Always show the invariant the reader is supposed to notice.
- **Pandoc TeX warnings** in stderr (`makeTextSection: …`) are cosmetic, unrelated to your sketch — ignore them and look at the verifier's exit code.
