# Skill: Charts & Graphs (Chart.js)

Render data visualizations — line charts, bar charts, scatter plots, area charts — inline in chapter markdown using Chart.js.

## CDN

```
https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.js
```

Included automatically by `build-book.sh` — no manual setup needed.

## When to Use

- Plotting data: measurements, frequencies, distributions, trends
- Showing mathematical relationships: f(x) curves, exponential vs linear growth
- Comparing quantities: side-by-side bars, overlaid lines
- Showing how a variable changes over time or across conditions
- Any time "the shape of the data" is the insight

## When NOT to Use

- Conceptual diagrams with boxes and arrows (use Rough.js skill)
- Domain-specific artifacts like sheet music or molecules (use domain skills)
- Single data points or simple comparisons easily stated in prose

## Template

Use unique canvas IDs (e.g., `chart-L02-frequency-ratios`). Each chart goes in an IIFE.

```html
<div class="chart-block">
<canvas id="chart-LNN-name" width="600" height="350"></canvas>
<div class="caption">What this chart shows</div>
</div>

<script>
(function() {
  var ctx = document.getElementById('chart-LNN-name').getContext('2d');
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['A', 'B', 'C', 'D'],
      datasets: [{
        label: 'Series 1',
        data: [10, 20, 15, 25],
        borderColor: '#8b4513',
        backgroundColor: 'rgba(139, 69, 19, 0.1)',
        fill: true,
        tension: 0.3
      }]
    },
    options: {
      responsive: false,
      plugins: {
        legend: { display: true, position: 'top' }
      },
      scales: {
        x: { title: { display: true, text: 'X Axis Label' }},
        y: { title: { display: true, text: 'Y Axis Label' }}
      }
    }
  });
})();
</script>
```

## Chart Types

### Line Chart

```javascript
new Chart(ctx, {
  type: 'line',
  data: {
    labels: ['Jan', 'Feb', 'Mar', 'Apr'],
    datasets: [{
      label: 'Values',
      data: [10, 20, 15, 25],
      borderColor: '#8b4513',
      tension: 0.3       // 0 = straight lines, 0.4 = smooth curves
    }]
  }
});
```

### Scatter Plot (X-Y data, no labels)

```javascript
new Chart(ctx, {
  type: 'scatter',
  data: {
    datasets: [{
      label: 'Data',
      data: [
        { x: 1, y: 2 },
        { x: 3, y: 5 },
        { x: 5, y: 4 },
      ],
      backgroundColor: '#8b4513'
    }]
  },
  options: {
    scales: {
      x: { type: 'linear', title: { display: true, text: 'X' }},
      y: { title: { display: true, text: 'Y' }}
    }
  }
});
```

### Plotting a Mathematical Function

Pre-calculate points and use scatter with `showLine: true`:

```javascript
// Plot y = sin(x) from -2π to 2π
var data = [];
for (var i = -100; i <= 100; i++) {
  var x = i * Math.PI / 50;
  data.push({ x: x, y: Math.sin(x) });
}

new Chart(ctx, {
  type: 'scatter',
  data: {
    datasets: [{
      label: 'sin(x)',
      data: data,
      showLine: true,
      borderColor: '#8b4513',
      pointRadius: 0,
      tension: 0.1
    }]
  },
  options: {
    scales: {
      x: { type: 'linear', title: { display: true, text: 'x' }},
      y: { title: { display: true, text: 'y' }}
    }
  }
});
```

### Bar Chart

```javascript
new Chart(ctx, {
  type: 'bar',
  data: {
    labels: ['A', 'B', 'C', 'D'],
    datasets: [{
      label: 'Values',
      data: [40, 25, 60, 10],
      backgroundColor: [
        'rgba(139, 69, 19, 0.7)',   // brown
        'rgba(41, 128, 185, 0.7)',  // blue
        'rgba(39, 174, 96, 0.7)',   // green
        'rgba(212, 160, 23, 0.7)'   // gold
      ],
      borderColor: [
        '#8b4513', '#2980b9', '#27ae60', '#d4a017'
      ],
      borderWidth: 1
    }]
  }
});
```

### Multiple Datasets (Overlay / Comparison)

```javascript
new Chart(ctx, {
  type: 'line',
  data: {
    labels: ['1', '2', '3', '4', '5'],
    datasets: [
      {
        label: 'Linear',
        data: [2, 4, 6, 8, 10],
        borderColor: '#2980b9',
        tension: 0
      },
      {
        label: 'Exponential',
        data: [2, 4, 8, 16, 32],
        borderColor: '#c0392b',
        tension: 0.3
      }
    ]
  }
});
```

### Area Chart (Filled Line)

```javascript
{
  label: 'Values',
  data: [10, 20, 15, 25],
  borderColor: '#8b4513',
  backgroundColor: 'rgba(139, 69, 19, 0.15)',
  fill: true
}
```

## Key Options

### Dataset Options

| Option | Values | Description |
|--------|--------|-------------|
| `borderColor` | color string | Line/border color |
| `backgroundColor` | color string | Fill/point color |
| `fill` | `true/false` | Fill area under line |
| `tension` | 0-0.4 | Line smoothing (0 = straight) |
| `pointRadius` | number | Point size (0 = hidden) |
| `showLine` | `true/false` | Connect scatter points |
| `borderWidth` | number | Line thickness |
| `borderDash` | `[5, 5]` | Dashed line pattern |

### Chart Options

```javascript
options: {
  responsive: false,          // false = use canvas width/height; true = fill container
  plugins: {
    legend: {
      display: true,
      position: 'top'         // 'top', 'bottom', 'left', 'right'
    },
    title: {
      display: true,
      text: 'Chart Title'
    },
    tooltip: {
      enabled: true           // hover tooltips
    }
  },
  scales: {
    x: {
      type: 'linear',         // 'linear', 'logarithmic', 'category'
      title: { display: true, text: 'Label' },
      min: 0,
      max: 100
    },
    y: {
      type: 'linear',
      title: { display: true, text: 'Label' },
      beginAtZero: true
    }
  }
}
```

### Annotations (Highlight Regions/Lines)

For highlighting specific values or regions, use the annotation plugin or draw directly on the canvas with `ctx`:

```javascript
// After chart creation, draw a horizontal reference line
var chart = new Chart(ctx, { /* ... */ });

// Use Chart.js plugin for simple annotations, or:
// Draw manually on the canvas after render
ctx.setLineDash([5, 5]);
ctx.strokeStyle = '#c0392b';
ctx.beginPath();
ctx.moveTo(chart.chartArea.left, yPixel);
ctx.lineTo(chart.chartArea.right, yPixel);
ctx.stroke();
ctx.setLineDash([]);
```

## Color Palette (matching book aesthetic)

| Use | Color | RGBA (for fills) |
|-----|-------|-------------------|
| Primary | `#8b4513` | `rgba(139, 69, 19, 0.15)` |
| Accent | `#c0392b` | `rgba(192, 57, 43, 0.15)` |
| Info | `#2980b9` | `rgba(41, 128, 185, 0.15)` |
| Positive | `#27ae60` | `rgba(39, 174, 96, 0.15)` |
| Warning | `#d4a017` | `rgba(212, 160, 23, 0.15)` |
| Muted | `#6b6b6b` | `rgba(107, 107, 107, 0.15)` |

## Common Patterns

1. **"This grows exponentially, not linearly"** → overlay two lines on same chart, one linear one exponential
2. **"Here's the frequency spectrum"** → bar chart of harmonic frequencies with decreasing amplitudes
3. **"Compare these distributions"** → grouped bar chart or overlaid area charts
4. **"This relationship is logarithmic"** → scatter plot with log scale on one axis
5. **"Watch how this changes as we increase X"** → line chart showing the trend
6. **"These two quantities are inversely related"** → scatter plot with hyperbolic curve
