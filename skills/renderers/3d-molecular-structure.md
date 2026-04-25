# Skill: 3D Molecular Structure (3Dmol.js)

Render real, rotatable 3D molecular structures inline in chapter markdown using 3Dmol.js. Loads PDB / PubChem / SDF data and lets the reader rotate, zoom, and inspect actual molecular geometry.

## CDN

```
https://cdn.jsdelivr.net/npm/3dmol@2.4.0/build/3Dmol-min.js
```

Included automatically by `build-book.sh` — no manual setup needed.

## When to Use

- **3D shape *is* the load-bearing insight** — protein folds where the geometry encodes function (β-barrels, ion channel pores, antibody Y-shape, capsid icosahedra, DNA double helix).
- **Comparative geometry** — "AMPA vs NMDA receptor pore shape" in a way 2D cartoons can't show.
- **Symmetry that matters** — viral capsids, transmembrane helices, β-barrel rings.
- **Spatial relationships hidden in 2D projections** — chromophore inside a barrel, ligand in a binding pocket, ion in a selectivity filter.

## When NOT to Use

- Cartoon-level structural intuition where a 2D sketch suffices (use `conceptual-diagrams` instead).
- Anything where a still 2D image conveys the whole point — don't render in 3D for decoration.
- Large complexes (>50,000 atoms) — viewer slows; use a simplified surface or a precomputed image.
- Anything that requires animation of conformational change — 3Dmol is for static-rotatable, not for time-varying simulations (use `animated-simulations` for that).

## Core Pattern

Each viewer needs a parent div with explicit dimensions. The script creates a viewer, loads structure data (typically by PDB ID), applies a style, zooms to fit, and renders.

```html
<div class="diagram-block">
<div id="mol-LNN-name" style="width:600px; height:400px; position:relative; margin:1rem auto; border:1px solid #e0dcd4;"></div>
<div class="caption">What the reader should rotate to see.</div>
</div>

<script>
window.addEventListener('load', function() {
  var viewer = $3Dmol.createViewer('mol-LNN-name', {
    backgroundColor: 'rgb(250, 248, 244)'
  });
  $3Dmol.download('pdb:1EMA', viewer, {}, function() {
    viewer.setStyle({}, {cartoon: {color: 'spectrum'}});
    viewer.zoomTo();
    viewer.render();
  });
});
</script>
```

## Loading Structures

### From a PDB ID (most common)

```javascript
$3Dmol.download('pdb:1EMA', viewer, {}, function() {
  viewer.setStyle({}, {cartoon: {color: 'spectrum'}});
  viewer.zoomTo();
  viewer.render();
});
```

`pdb:NNNN` looks up the RCSB PDB. Common IDs you'll likely use:

| Molecule | PDB ID | Note |
|----------|--------|------|
| GFP (Aequorea) | `1EMA` | The β-barrel cradling the chromophore |
| GFP (S65T mutant, brighter) | `1GFL` | Alternative |
| Antibody (IgG, full) | `1IGT` | The classic Y |
| Fab fragment (one arm) | `1IGY` | Smaller, faster to render |
| AAV2 capsid | `1LP3` | Icosahedral viral capsid |
| AAV9 capsid | `3UX1` | Brain-tropic AAV |
| B-form DNA dodecamer | `1BNA` | Standard double helix |
| AMPA receptor | `3KG2` | Tetrameric glutamate receptor |
| NMDA receptor | `4PE5` | Heterotetramer with Mg²⁺ block |
| GABA-A receptor | `6X3X` | Pentameric Cl⁻ channel |
| Voltage-gated K⁺ (Shaker) | `1BL8` | KcsA, classic |
| Na⁺/K⁺ ATPase | `3B8E` | Pump in conformational state |

### From inline PDB / MOL / XYZ data

```javascript
var pdbData = "ATOM      1  N   MET A   1      ...";   // your PDB text
viewer.addModel(pdbData, 'pdb');
viewer.setStyle({}, {stick: {}});
viewer.zoomTo();
viewer.render();
```

## Styling

`setStyle(selector, styleObj)` applies a render style to atoms matching the selector. Empty selector `{}` means everything. Multiple `setStyle` calls compose (later overrides earlier for matching atoms).

### Common styles

```javascript
// Cartoon (ribbons for proteins, helices for DNA)
viewer.setStyle({}, {cartoon: {color: 'spectrum'}});

// Spectrum colors by residue index — rainbow N-to-C terminus
viewer.setStyle({}, {cartoon: {color: 'spectrum'}});

// Solid color
viewer.setStyle({}, {cartoon: {color: 'orange'}});

// Color by chain
viewer.setStyle({}, {cartoon: {colorscheme: 'chain'}});

// Stick model (every bond visible)
viewer.setStyle({}, {stick: {radius: 0.15}});

// Sphere model (van der Waals balls)
viewer.setStyle({}, {sphere: {scale: 0.3}});

// Cartoon for protein backbone + sticks for ligands
viewer.setStyle({}, {cartoon: {color: 'lightgray'}});
viewer.setStyle({hetflag: true}, {stick: {colorscheme: 'greenCarbon'}});
```

### Atom selectors

```javascript
{chain: 'A'}                      // all atoms in chain A
{resi: [50, 51, 52]}               // residues 50–52
{resn: 'HIS'}                      // all histidines
{atom: 'CA'}                       // alpha carbons only
{hetflag: true}                    // ligands & non-standard residues (chromophores!)
{chain: 'A', resi: 65}             // composable
```

### Highlighting a specific feature (e.g. the GFP chromophore)

The GFP chromophore in PDB 1EMA is residue 66 (CRO):

```javascript
$3Dmol.download('pdb:1EMA', viewer, {}, function() {
  // β-barrel as faded gray cartoon
  viewer.setStyle({}, {cartoon: {color: 'lightgray', opacity: 0.7}});
  // chromophore as bright green sticks
  viewer.setStyle({resn: 'CRO'}, {stick: {colorscheme: 'greenCarbon', radius: 0.25}});
  viewer.zoomTo({resn: 'CRO'});       // center camera on the chromophore
  viewer.render();
});
```

## Useful Viewer Methods

```javascript
viewer.zoomTo();                        // fit whole structure
viewer.zoomTo({chain: 'A'});            // fit a selection
viewer.center({resn: 'CRO'});           // center camera on selection (no zoom change)
viewer.rotate(30, 'y');                 // rotate 30° around y axis
viewer.spin('y', 1);                    // continuous spin (1 = slow, 5 = fast)
viewer.spin(false);                     // stop spinning
viewer.setBackgroundColor('rgb(250,248,244)');
viewer.addSurface($3Dmol.SurfaceType.VDW, {opacity: 0.7, color: 'white'});
viewer.removeAllSurfaces();
viewer.addLabel('chromophore', {position: {x: 0, y: 0, z: 0}, fontColor: 'red'});
```

## Auto-spin pattern (good default)

A slow continuous spin draws the eye and shows 3D structure without requiring the reader to drag. Reader can still grab and rotate manually.

```javascript
$3Dmol.download('pdb:1LP3', viewer, {}, function() {
  viewer.setStyle({}, {cartoon: {colorscheme: 'chain'}});
  viewer.zoomTo();
  viewer.spin('y', 0.5);
  viewer.render();
});
```

## Style Guidelines

- **Background** — `'rgb(250, 248, 244)'` matches the book's warm earth-tone palette.
- **Default style** — `cartoon` with `color: 'spectrum'` for proteins; `cartoon` is the right starting point. Reach for sticks/spheres only for ligands or tiny fragments.
- **Border + caption** — wrap in `<div class="diagram-block">` and add a `<div class="caption">` so the figure looks intentional.
- **Size** — 600×400 is the standard. Don't go smaller than 400×300 (geometry becomes illegible).
- **Auto-spin** — add `viewer.spin('y', 0.5)` to nudge the reader into seeing it as 3D.
- **Highlight, don't dump** — fade everything except the load-bearing feature. A protein at full opacity looks like a colorful blob; the same protein with the chromophore highlighted on a faded backbone is a teaching moment.

## Common Patterns

### 1. β-barrel with interior chromophore (GFP)

```javascript
$3Dmol.download('pdb:1EMA', viewer, {}, function() {
  viewer.setStyle({}, {cartoon: {color: 'lightgray', opacity: 0.6}});
  viewer.setStyle({resn: 'CRO'}, {stick: {colorscheme: 'greenCarbon', radius: 0.3}});
  viewer.addSurface($3Dmol.SurfaceType.VDW, {opacity: 0.2, color: 'white'},
                   {chain: 'A', not: {resn: 'CRO'}});
  viewer.zoomTo();
  viewer.spin('y', 0.5);
  viewer.render();
});
```

### 2. Viral capsid (icosahedral symmetry)

```javascript
$3Dmol.download('pdb:1LP3', viewer, {}, function() {
  viewer.setStyle({}, {cartoon: {colorscheme: 'chain'}});
  viewer.zoomTo();
  viewer.spin('y', 0.4);
  viewer.render();
});
```

### 3. DNA double helix

```javascript
$3Dmol.download('pdb:1BNA', viewer, {}, function() {
  viewer.setStyle({}, {cartoon: {color: 'spectrum'}});
  viewer.setStyle({atom: ['N1','N3','C2','C4','C5','C6','N7','N9','C8']},
                  {stick: {radius: 0.08}});
  viewer.zoomTo();
  viewer.spin('y', 0.5);
  viewer.render();
});
```

### 4. Antibody Y-shape

```javascript
$3Dmol.download('pdb:1IGT', viewer, {}, function() {
  viewer.setStyle({}, {cartoon: {colorscheme: 'chain'}});
  viewer.zoomTo();
  viewer.spin('y', 0.3);
  viewer.render();
});
```

## ⚠️ pandoc-safe HTML pattern

Like all renderers that emit raw HTML inside markdown, the **container `<div>` and its children must not be indented** — pandoc treats indented lines (4+ spaces) as a code block and will silently escape your `<div>` and `<script>` tags. Keep every tag at column 0 inside the HTML block. This is fine for 3Dmol because the typical pattern only has a single child div anyway, but worth knowing.

## Common Pitfalls

- **PDB ID typos** — `$3Dmol.download` silently fails on bad IDs. Verify the ID at rcsb.org first.
- **Network timing** — the structure loads asynchronously; never call `setStyle/zoomTo/render` outside the download callback.
- **Tiny canvas** — under ~400×300, cartoon ribbons become illegible. Don't shrink to fit.
- **No `position: relative`** — without it, the WebGL canvas can escape its parent on some browsers. Always set on the parent div.
- **Forgetting to render** — `setStyle` mutates state; nothing changes until `viewer.render()`.
- **Highlight overload** — coloring by spectrum + adding a surface + spinning + showing every ligand at once = noise. Pick one feature, fade the rest.
- **Verifier compatibility** — WebGL works in headless Chromium but is sometimes flaky. If `verify-render.js` keeps failing on a 3D viewer after 3 retries, drop the visual; don't fight the verifier.
