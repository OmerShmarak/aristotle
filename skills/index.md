# Skills Index

## Renderers

Rendering skills provide templates, API references, and examples for visual rendering libraries. Sub-agents should read the full skill file when they need to generate that type of visual.

| Skill | File | What it renders |
|-------|------|-----------------|
| Conceptual Diagrams | `skills/renderers/conceptual-diagrams.md` | Hand-drawn Rough.js diagrams for when prose can't convey the insight. Use for: (1) Scale comparisons that break intuition — when numbers are so different words fail, (2) Counterintuitive patterns — exponential vs linear, things that violate assumptions, (3) Abstract temporal/spatial processes — causality unfolding in ways hard to track verbally, (4) Comparative anatomy/structure — when physical arrangement and spatial relationships matter, (5) Causal chains with feedback — when A→B→C→A and the loop is the insight. Do NOT use for simple lists, linear sequences, intuitive facts, or decoration. |
| Flow Chains | `skills/renderers/flow-chains.md` | Hand-drawn Rough.js linear flow chains (A → B → C → D). Dependency chains, breakdown roadmaps, prerequisite sequences. Agent just provides an array of labels — auto-sizes everything. |
| Charts & Graphs | `skills/renderers/charts-and-graphs.md` | Data visualizations (Chart.js). Line charts, bar charts, scatter plots, area charts, mathematical function plots. Use when the shape of data or a mathematical relationship is the insight. |
| Music Notation | `skills/renderers/music-notation.md` | Sheet music notation (VexFlow). Notes, chords, staves, key signatures, grand staff. Highlight/color individual notes. Use when the chapter references specific notes, melodies, chords, or passages. |
| Animated Simulations | `skills/renderers/animated-simulations.md` | Interactive time-based simulations (p5.js). Random walks, emergent behavior, wave propagation, oscillators, particle flow, live physics. Use when motion *is* the insight — when a still image can't convey the process (diffusion, action potentials, flocking, feedback oscillations, statistical intuitions). Always ships with Pause/Reset and live stats. |
| 3D Molecular Structure | `skills/renderers/3d-molecular-structure.md` | Real, rotatable 3D molecular structures via 3Dmol.js (loads PDB IDs). Use when the **3D shape itself is the insight**: protein folds (β-barrels, ion channel pores), antibody Y-shape, viral capsid icosahedra, DNA double helix, ligand-in-pocket geometry. Don't use for cartoon-level structural intuition where 2D sketches suffice. |
| Interactive Plots | `skills/renderers/interactive-plot.md` | Chart.js plots driven live by HTML range sliders. Use when **parameter sensitivity is the insight** — "watch the binomial collapse as p drops," "push n and feel effective code space scale." Replaces static charts when the static-ness was a missed teaching moment. Two sliders max. |

## ⚠️ Adding a new renderer skill — mechanical checklist

Every renderer that needs its own CDN script touches multiple files. To add a new one without breaking the verifiers:

1. **Add the CDN URL** to `RENDERER_SCRIPTS` in `/Users/omers/fun/aristotle/cdn-scripts.js`. That single file is consumed by `build-book.sh`, `verify-render.js`, and `verify-collisions.js` — you don't have to touch any of them.
2. **Write the skill doc** at `skills/renderers/<name>.md`. Mirror the structure of an existing skill (CDN, When to Use, When NOT to Use, template, API, patterns, pitfalls).
3. **Add a row to the table above** so chapter agents can discover it from `skills/index.md`.
4. **Test in a sandbox** with a minimal HTML using the CDN before declaring the skill ready. Pandoc transformations and CDN load order can break things in non-obvious ways.

## ⚠️ Two universal HTML pitfalls (relevant to every renderer)

- **Don't indent HTML inside an HTML block.** Pandoc converts indented lines to a markdown code block and escapes your tags. Every `<div>`, `<input>`, `<canvas>`, `<script>` tag inside an HTML block must start at column 0 — even when nesting is logically deep.
- **Add a defensive null check** before `addEventListener` or any DOM access that depends on inline HTML. If pandoc silently escaped your input/canvas/etc., a clear `throw new Error('id missing — pandoc indentation?')` gives the verifier (and you) a useful failure instead of a `Cannot read properties of null` mystery.
