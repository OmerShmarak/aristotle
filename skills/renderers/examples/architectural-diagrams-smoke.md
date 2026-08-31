# Architectural Diagrams Smoke Test

This file exercises a section and an exploded axonometric with the architectural-diagram renderer.

<div class="diagram-block">
<div id="arch-smoke-section" class="architecture-diagram" style="width:100%;max-width:680px;aspect-ratio:17/10"></div>
<div class="caption">The red path remains continuous from the supported floor through wall and footing into a wider patch of soil.</div>
</div>

<script>
(function () {
const host = document.getElementById('arch-smoke-section');
if (!host) throw new Error('arch-smoke-section missing — Pandoc indentation?');
if (typeof SVG === 'undefined') throw new Error('SVG.js did not load');
const W = 680, H = 400;
const draw = SVG().addTo(host).size('100%', '100%').viewbox(0, 0, W, H);
draw.attr({ role: 'img', 'aria-label': 'Diagrammatic building section tracing a floor load through a wall and footing into soil', preserveAspectRatio: 'xMidYMid meet' });
const C = { ink: '#292a2d', muted: '#77736b', paper: '#faf8f4', concrete: '#d7d3ca', soil: '#c7aa7b', load: '#b6403a' };
const soilPattern = draw.pattern(12, 12, function (add) {
add.rect(12, 12).fill('#eadfc9');
add.circle(1.6).center(3, 4).fill('#a98b61');
add.circle(1.2).center(9, 9).fill('#a98b61');
});
const loadHead = draw.marker(10, 10, function (add) {
add.path('M 0 0 L 10 5 L 0 10 z').fill(C.load);
});
loadHead.attr({ orient: 'auto', refX: 9, refY: 5 });
function arrow(x1, y1, x2, y2) {
return draw.line(x1, y1, x2, y2).stroke({ color: C.load, width: 3, linecap: 'round' }).marker('end', loadHead);
}
function leaderLabel(text, textX, textY, targetX, targetY) {
const t = draw.text(text).font({ family: 'Arial, Helvetica, sans-serif', size: 14, weight: 600 }).fill(C.ink).move(textX, textY);
const box = t.bbox();
draw.line(targetX, targetY, box.x - 7, box.cy).stroke({ color: C.muted, width: 1.2, linecap: 'round' });
t.front();
}
draw.text('SECTION — DIAGRAMMATIC, NOT TO SCALE').font({ family: 'Arial, sans-serif', size: 12, weight: 700 }).fill(C.muted).move(30, 18);
draw.rect(500, 75).move(30, 305).fill(soilPattern);
draw.line(30, 305, 530, 305).stroke({ color: C.ink, width: 1.5 });
draw.rect(180, 40).move(180, 285).fill(C.concrete).stroke({ color: C.ink, width: 5 });
draw.rect(70, 155).move(235, 130).fill(C.concrete).stroke({ color: C.ink, width: 5 });
draw.rect(190, 24).move(305, 235).fill(C.concrete).stroke({ color: C.ink, width: 4 });
draw.line(495, 259, 495, 305).stroke({ color: C.muted, width: 1, dasharray: '6 5' });
arrow(270, 55, 270, 128);
arrow(270, 170, 270, 280);
arrow(270, 330, 270, 370);
leaderLabel('supporting wall', 550, 150, 310, 170);
leaderLabel('floor slab', 550, 225, 497, 245);
leaderLabel('spreading footing', 550, 288, 365, 305);
leaderLabel('supporting soil', 550, 345, 510, 345);
})();
</script>

<div class="diagram-block">
<div id="arch-smoke-axon" class="architecture-diagram" style="width:100%;max-width:680px;aspect-ratio:17/10"></div>
<div class="caption">An exploded axonometric preserves alignment while separating the foundation, platform, and braced frame into readable assembly stages.</div>
</div>

<script>
(function () {
const host = document.getElementById('arch-smoke-axon');
if (!host) throw new Error('arch-smoke-axon missing — Pandoc indentation?');
if (typeof SVG === 'undefined') throw new Error('SVG.js did not load');
const W = 680, H = 400;
const draw = SVG().addTo(host).size('100%', '100%').viewbox(0, 0, W, H);
draw.attr({ role: 'img', 'aria-label': 'Exploded axonometric of a foundation, floor platform, and braced wall frame', preserveAspectRatio: 'xMidYMid meet' });
const C = { ink: '#292a2d', muted: '#77736b', concrete: '#d7d3ca', timber: '#c9955d', highlight: '#d99a2b' };
const ISO = { ox: 260, oy: 270, x: 0.736, y: 0.425, z: 0.85 };
function iso(x, y, z) { return [ISO.ox + (x - y) * ISO.x, ISO.oy + (x + y) * ISO.y - z]; }
function face(points, fill, stroke = C.ink, width = 1.6) {
return draw.polygon(points.map((p) => iso(...p))).fill(fill).stroke({ color: stroke, width, linejoin: 'round' });
}
function isoBox(x, y, z, w, d, h, colors) {
const p000 = [x,y,z], p100 = [x+w,y,z], p010 = [x,y+d,z], p110 = [x+w,y+d,z];
const p001 = [x,y,z+h], p101 = [x+w,y,z+h], p011 = [x,y+d,z+h], p111 = [x+w,y+d,z+h];
face([p000,p100,p101,p001], colors.front);
face([p100,p110,p111,p101], colors.side);
face([p001,p101,p111,p011], colors.top);
}
function leaderLabel(text, textX, textY, targetX, targetY) {
const t = draw.text(text).font({ family: 'Arial, Helvetica, sans-serif', size: 14, weight: 600 }).fill(C.ink).move(textX, textY);
const box = t.bbox();
draw.line(targetX, targetY, box.x - 7, box.cy).stroke({ color: C.muted, width: 1.2, linecap: 'round' });
t.front();
}
draw.text('EXPLODED AXONOMETRIC — ALIGNMENT RETAINED').font({ family: 'Arial, sans-serif', size: 12, weight: 700 }).fill(C.muted).move(30, 18);
isoBox(0, 0, 0, 180, 115, 20, { front: '#c3beb4', side: '#aaa59c', top: C.concrete });
isoBox(12, 10, 70, 156, 95, 12, { front: '#b47d47', side: '#9d6839', top: C.timber });
isoBox(20, 18, 135, 14, 10, 100, { front: '#b47d47', side: '#9d6839', top: C.timber });
isoBox(145, 18, 135, 14, 10, 100, { front: '#b47d47', side: '#9d6839', top: C.timber });
isoBox(20, 18, 135, 139, 10, 10, { front: '#b47d47', side: '#9d6839', top: C.timber });
isoBox(20, 18, 225, 139, 10, 10, { front: '#b47d47', side: '#9d6839', top: C.timber });
const a = iso(27, 18, 145), b = iso(152, 18, 225), c = iso(152, 18, 145), d = iso(27, 18, 225);
draw.line(a[0], a[1], b[0], b[1]).stroke({ color: C.highlight, width: 4, linecap: 'round' });
draw.line(c[0], c[1], d[0], d[1]).stroke({ color: C.highlight, width: 4, linecap: 'round' });
[[90,45,20,70],[90,45,82,123],[90,45,235,265]].forEach(function (g) {
const p1 = iso(g[0], g[1], g[2]), p2 = iso(g[0], g[1], g[3]);
draw.line(p1[0], p1[1], p2[0], p2[1]).stroke({ color: C.muted, width: 1, dasharray: '5 5' });
});
const foundationTarget = iso(180, 30, 15);
const platformTarget = iso(168, 30, 78);
const frameTarget = iso(159, 18, 205);
leaderLabel('1  foundation', 525, 265, foundationTarget[0], foundationTarget[1]);
leaderLabel('2  floor platform', 525, 190, platformTarget[0], platformTarget[1]);
leaderLabel('3  braced frame', 525, 85, frameTarget[0], frameTarget[1]);
})();
</script>
