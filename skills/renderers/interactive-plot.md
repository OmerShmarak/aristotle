# Skill: Interactive Plots (Chart.js + sliders)

Render Chart.js plots whose data is recomputed live from HTML range sliders. Lets the reader push parameters and watch the curve respond — the right tool when the insight is *parameter sensitivity*, not a single static distribution.

## CDN

Already loaded by `build-book.sh` (Chart.js 4.5.1). No new dependency.

## When to Use

- **Parameter sensitivity is the insight** — "what happens to the binomial when p changes?", "how does the effective code space scale with n?"
- **OOM intuitions you want the reader to *feel*** — let them push p from 0.5 down to 0.1 and watch the distribution collapse onto small k.
- **Comparing what-if scenarios** — overlay two distributions, let the reader change one and see the gap open or close.
- **Replacing a static plot whose static-ness was a missed teaching moment** — if you find yourself describing "and as p decreases, the curve shifts left," make it a slider.

## When NOT to Use

- A single static snapshot fully conveys the point (use plain `charts-and-graphs`).
- Multiple parameters with non-trivial interactions (consider `animated-simulations` instead — full p5 sketch).
- Anything that needs >2 sliders to be useful (UX collapses; pick a 2D heatmap or animation instead).

## ⚠️ CRITICAL: pandoc-safe HTML pattern

**Do not indent HTML inside an HTML block.** Pandoc treats lines that start with 4+ spaces as a markdown indented code block — *even when they're inside a `<div>`*. This silently converts your `<input>` and `<span>` tags into escaped text. The resulting page has no slider element with the id you wrote, `document.getElementById(...)` returns `null`, and `.addEventListener` throws — but the verifier may not catch it unless JS-error-on-fail is turned on.

The rule: **every HTML tag inside an HTML block starts at column 0**. No indentation. Lines can be visually flat — sacrifice prettiness for correctness.

## Core Pattern (verified working)

```html
<div class="chart-block">
<div style="width:600px; margin:0 auto; padding:0.6rem 0; font-family:'Comic Sans MS', cursive; font-size:13px;">
<label>p = </label>
<input id="plot-LNN-p" type="range" min="0.05" max="0.95" step="0.05" value="0.3" style="width:160px;">
<span id="plot-LNN-p-val">0.30</span>
&nbsp;&nbsp;
<label>n = </label>
<input id="plot-LNN-n" type="range" min="5" max="50" step="1" value="25" style="width:160px;">
<span id="plot-LNN-n-val">25</span>
</div>

<canvas id="plot-LNN-chart" width="600" height="350"></canvas>
<div class="caption">What the reader should push the sliders to feel.</div>
</div>

<script>
(function() {
  // ── compute ──
  function logChoose(n, k) {
    if (k < 0 || k > n) return -Infinity;
    var s = 0;
    for (var i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i);
    return s;
  }
  function binomialPMF(n, p) {
    var out = new Array(n + 1);
    var lp = Math.log(p), lq = Math.log(1 - p);
    for (var k = 0; k <= n; k++) {
      out[k] = Math.exp(logChoose(n, k) + k * lp + (n - k) * lq);
    }
    return out;
  }

  function buildData(n, p) {
    var pmf = binomialPMF(n, p);
    return {
      labels: pmf.map(function(_, k) { return k; }),
      datasets: [{
        label: 'P(k expressed)',
        data: pmf,
        backgroundColor: 'rgba(139, 69, 19, 0.55)',
        borderColor: '#8b4513',
        borderWidth: 1
      }]
    };
  }

  // ── chart ──
  var ctx = document.getElementById('plot-LNN-chart').getContext('2d');
  var chart = new Chart(ctx, {
    type: 'bar',
    data: buildData(25, 0.3),
    options: {
      responsive: false,
      animation: { duration: 200 },
      plugins: { legend: { display: false } },
      scales: {
        x: { title: { display: true, text: 'k = number expressed' } },
        y: { title: { display: true, text: 'probability' }, beginAtZero: true }
      }
    }
  });

  // ── slider hookup ──
  var pSlider = document.getElementById('plot-LNN-p');
  var nSlider = document.getElementById('plot-LNN-n');
  var pVal    = document.getElementById('plot-LNN-p-val');
  var nVal    = document.getElementById('plot-LNN-n-val');

  // Defensive: if any of these is missing, the HTML block didn't render —
  // probably because of pandoc-indentation or a typo'd id. Fail loudly so
  // the verifier catches it.
  if (!pSlider || !nSlider || !pVal || !nVal) {
    throw new Error('plot-LNN: slider DOM elements missing — check that HTML inside the chart-block div is not indented (pandoc would treat indented lines as a code block).');
  }

  function update() {
    var p = parseFloat(pSlider.value);
    var n = parseInt(nSlider.value, 10);
    pVal.textContent = p.toFixed(2);
    nVal.textContent = n;
    chart.data = buildData(n, p);
    chart.update('none');   // 'none' = no animation; smoother for live drag
  }

  pSlider.addEventListener('input', update);
  nSlider.addEventListener('input', update);
})();
</script>
```

## API Pattern

The shape of every interactive plot is the same:

1. Define a **pure compute function** `buildData(...params)` that returns a Chart.js `data` object.
2. Build the chart once with the initial parameters.
3. Wire each slider's `input` event to: read all slider values, update the value-readout spans, call `buildData(...)`, assign it to `chart.data`, then `chart.update('none')`.
4. **Add a defensive null-check** before `addEventListener` — if any element is null, throw a clear error. This makes the verifier's JS-error-detection give you a useful message instead of a cryptic null-deref.

The `chart.update('none')` call (no-animation update) is the magic that makes drag feel responsive. Default `chart.update()` re-runs the entrance animation on every frame and looks broken.

## Slider UX Guidelines

- **Always show the live value** in a `<span>` next to the slider. A slider without a numeric readout is opaque.
- **Sensible step sizes** — for `p`, step 0.05 is fluid. For `n`, step 1 is fine up to ~50.
- **Sensible bounds** — don't let the reader push parameters into degenerate territory unless that's the point. For binomial, `p` in [0.05, 0.95] avoids visual blow-ups.
- **Two sliders max** — three or more and the reader can't reason about what changed.
- **Comic Sans labels** to match the rest of the book's diagrams.
- **Keep all input/label/span tags at column 0 inside the `<div>`** — see the pandoc warning above.

## Common Patterns

### 1. Single-distribution sandbox (binomial, normal, Poisson)

The template above. Slider drives PMF parameters; bar chart redraws.

### 2. Comparison (two-distribution overlay)

```javascript
function buildData(p, q) {
  var n = 25;
  return {
    labels: Array.from({length: n + 1}, function(_, k) { return k; }),
    datasets: [
      { label: 'p = ' + p.toFixed(2), data: binomialPMF(n, p),
        backgroundColor: 'rgba(139, 69, 19, 0.5)' },
      { label: 'q = ' + q.toFixed(2), data: binomialPMF(n, q),
        backgroundColor: 'rgba(41, 128, 185, 0.5)' }
    ]
  };
}
```

### 3. Log-scale comparison bar (effective code space vs target)

When the *value* you're plotting spans many OOMs (theoretical vs effective vs target):

```javascript
new Chart(ctx, {
  type: 'bar',
  data: { /* ... */ },
  options: {
    scales: { y: { type: 'logarithmic', title: { display: true, text: 'count (log)' } } }
  }
});
```

Recompute on slider change as in the template.

### 4. Function plot with parameter slider

```javascript
function buildData(k) {
  var pts = [];
  for (var x = 0; x <= 10; x += 0.1) pts.push({ x: x, y: Math.exp(-k * x) });
  return {
    datasets: [{
      label: 'e^(-' + k.toFixed(2) + 'x)',
      data: pts,
      showLine: true,
      borderColor: '#8b4513',
      pointRadius: 0,
      tension: 0.1
    }]
  };
}
```

Use `type: 'scatter'` for the chart so x can be continuous.

## Color Palette

Same as `charts-and-graphs.md`:

| Use | Color | RGBA (for fills) |
|-----|-------|-------------------|
| Primary | `#8b4513` | `rgba(139, 69, 19, 0.55)` |
| Secondary | `#2980b9` | `rgba(41, 128, 185, 0.55)` |
| Accent | `#c0392b` | `rgba(192, 57, 43, 0.55)` |
| Positive | `#27ae60` | `rgba(39, 174, 96, 0.55)` |

## Common Pitfalls

- **Indenting HTML inside the chart-block div** → pandoc converts to a code block, escapes your tags, your sliders are *literally text on the page*. The verifier will catch this only if JS-error-on-fail is enabled and your script tries to access the missing elements with a defensive throw. **Always start every HTML tag at column 0 inside the block.**
- **Forgetting `chart.update('none')`** → using plain `chart.update()` re-animates every drag frame, looks like a stutter.
- **Recomputing on `change` instead of `input`** → `change` only fires on release; `input` fires every drag step. You almost always want `input`.
- **Sliders without a value readout** → opaque UX.
- **No defensive null-check before `addEventListener`** → the verifier sees a null-deref instead of "your HTML didn't render."
- **Heavy compute inside `update()`** → if your `buildData` does a 100K-point loop, drag will lag. Cache or downsample.
- **Forgetting `responsive: false`** → Chart.js will fight your canvas size on resize. Lock it.
- **Pandoc TeX warnings** in stderr (`makeTextSection: …`) are cosmetic and unrelated to your script — ignore them, look at verify-render's exit code.
- **Three sliders** — readers can't isolate which knob did what. Stop at two.
