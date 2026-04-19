# Skills Index

## Renderers

Rendering skills provide templates, API references, and examples for visual rendering libraries. Sub-agents should read the full skill file when they need to generate that type of visual.

| Skill | File | What it renders |
|-------|------|-----------------|
| Conceptual Diagrams | `skills/renderers/conceptual-diagrams.md` | Hand-drawn Rough.js diagrams for when prose can't convey the insight. Use for: (1) Scale comparisons that break intuition — when numbers are so different words fail, (2) Counterintuitive patterns — exponential vs linear, things that violate assumptions, (3) Abstract temporal/spatial processes — causality unfolding in ways hard to track verbally, (4) Comparative anatomy/structure — when physical arrangement and spatial relationships matter, (5) Causal chains with feedback — when A→B→C→A and the loop is the insight. Do NOT use for simple lists, linear sequences, intuitive facts, or decoration. |
| Mathematical Geometry | `skills/renderers/mathematical-geometry.md` | Precise math constructions via JSXGraph (SVG output, KaTeX labels). Use for: orthogonal projections and perpendiculars, inner-product / angle geometry, covariance or level-set ellipses, parametric and function curves, any construction where the *correctness* of the geometry is the insight. Prefer over Rough.js whenever you'd otherwise have to compute coordinates by hand (feet of perpendiculars, angle arcs, rotated ellipses). Do NOT use for conceptual flows, feedback loops, or hand-drawn warmth — those stay with Rough.js. |
| Flow Chains | `skills/renderers/flow-chains.md` | Hand-drawn Rough.js linear flow chains (A → B → C → D). Dependency chains, breakdown roadmaps, prerequisite sequences. Agent just provides an array of labels — auto-sizes everything. |
| Charts & Graphs | `skills/renderers/charts-and-graphs.md` | Data visualizations (Chart.js). Line charts, bar charts, scatter plots, area charts, mathematical function plots. Use when the shape of data or a mathematical relationship is the insight. |
| Music Notation | `skills/renderers/music-notation.md` | Sheet music notation (VexFlow). Notes, chords, staves, key signatures, grand staff. Highlight/color individual notes. Use when the chapter references specific notes, melodies, chords, or passages. |
