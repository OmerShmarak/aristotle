#!/usr/bin/env node
// Verify that text labels don't overlap with drawings on SVG boards.
// Usage: node verifiers/verify-svg-collisions.js <breakdown-dir> <chapter-file.md>
//
// Approach: render the chapter in a headless browser, locate every .jxgbox or
// .architecture-diagram container, collect bounding rects (via
// getBoundingClientRect) of:
//   - text overlays JSXGraph drops beside the SVG (HTML divs/spans; where
//     KaTeX output lives when useKatex:true)
//   - <text> nodes inside the SVG itself (non-KaTeX fallback)
//   - drawing primitives inside the SVG (<line>, <path>, <polyline>,
//     <polygon>, <circle>, <ellipse>, <rect>)
// A "collision" is a significant rectangular overlap between a text rect and
// a drawing rect — significant meaning the overlap area exceeds 20% of the
// text's area. Corner-touches and anti-aliasing nudges are tolerated.
//
// Cleanly no-ops when a chapter has no supported SVG boards (same contract as
// verify-collisions.js when a chapter has no canvases).
//
// Exit code 0 = no collisions (or no boards). Non-zero = collisions found.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const puppeteer = require('puppeteer');
const { KATEX_HEAD, RENDERER_SCRIPTS, RENDERER_STYLES } = require('../cdn-scripts.js');

const OVERLAP_RATIO = 0.2; // overlap area / text area

function buildCdnTags() {
  return [
    ...KATEX_HEAD,
    ...RENDERER_STYLES.map((url) => `<link rel="stylesheet" href="${url}">`),
    ...RENDERER_SCRIPTS.map((url) => `<script src="${url}"></script>`),
  ].join('\n');
}

function buildHtml(chapterFile) {
  const body = execSync(`pandoc --from=markdown --to=html5 "${chapterFile}"`, {
    encoding: 'utf8',
  });
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
${buildCdnTags()}
<style>
  body { background: #faf8f4; margin: 0; padding: 16px; }
  .jxgbox { background: #faf8f4; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node verifiers/verify-svg-collisions.js <breakdown-dir> <chapter-file.md>');
    process.exit(1);
  }

  const chapterFile = path.resolve(args[1]);
  if (!fs.existsSync(chapterFile)) {
    console.error(`Chapter file not found: ${chapterFile}`);
    process.exit(1);
  }

  const tmpFile = path.join(
    os.tmpdir(),
    `svg-collision-${path.basename(chapterFile, '.md')}-${process.pid}-${Math.random().toString(36).slice(2)}.html`
  );
  fs.writeFileSync(tmpFile, buildHtml(chapterFile));

  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 1600 });

    const jsErrors = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await page.goto('file://' + tmpFile, { waitUntil: 'networkidle0', timeout: 30000 });
    // Give JSXGraph + KaTeX time to settle.
    await new Promise((r) => setTimeout(r, 2000));

    const boardCount = await page.evaluate(
      () => document.querySelectorAll('.jxgbox, .architecture-diagram').length
    );
    if (boardCount === 0) {
      console.log('No supported SVG boards found in chapter.');
      await browser.close();
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      process.exit(0);
    }

    const report = await page.evaluate((overlapRatio) => {
      function rectOf(el) {
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
      }
      function area(r) { return Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top); }
      function overlap(a, b) {
        const left = Math.max(a.left, b.left);
        const top = Math.max(a.top, b.top);
        const right = Math.min(a.right, b.right);
        const bottom = Math.min(a.bottom, b.bottom);
        if (right <= left || bottom <= top) return 0;
        return (right - left) * (bottom - top);
      }

      // Transform an SVG element's local (x, y) into viewport pixel coords.
      function toViewport(svgEl, x, y) {
        const ctm = svgEl.getScreenCTM();
        if (!ctm) return { x, y };
        return { x: ctm.a * x + ctm.c * y + ctm.e, y: ctm.b * x + ctm.d * y + ctm.f };
      }

      // Liang–Barsky: does the segment (x1,y1)-(x2,y2) clip into the rect?
      function segmentIntersectsRect(x1, y1, x2, y2, r) {
        const dx = x2 - x1, dy = y2 - y1;
        let t0 = 0, t1 = 1;
        const p = [-dx, dx, -dy, dy];
        const q = [x1 - r.left, r.right - x1, y1 - r.top, r.bottom - y1];
        for (let i = 0; i < 4; i++) {
          if (p[i] === 0) {
            if (q[i] < 0) return false;
          } else {
            const t = q[i] / p[i];
            if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
            else          { if (t < t0) return false; if (t < t1) t1 = t; }
          }
        }
        return true;
      }

      function lineLengthInsideRect(x1, y1, x2, y2, r) {
        // Clip the segment to the rect; return the clipped length or 0.
        const dx = x2 - x1, dy = y2 - y1;
        let t0 = 0, t1 = 1;
        const p = [-dx, dx, -dy, dy];
        const q = [x1 - r.left, r.right - x1, y1 - r.top, r.bottom - y1];
        for (let i = 0; i < 4; i++) {
          if (p[i] === 0) { if (q[i] < 0) return 0; }
          else {
            const t = q[i] / p[i];
            if (p[i] < 0) { if (t > t1) return 0; if (t > t0) t0 = t; }
            else          { if (t < t0) return 0; if (t < t1) t1 = t; }
          }
        }
        if (t1 <= t0) return 0;
        const cx = (t1 - t0) * dx, cy = (t1 - t0) * dy;
        return Math.sqrt(cx * cx + cy * cy);
      }

      // Line-like drawings use their actual geometry; filled area drawings use
      // bbox overlap. In particular, an unfilled SVG path's bbox can cover a
      // large empty region (or have zero height), so it must not be treated as
      // a filled area.
      const results = { boards: 0, totalTexts: 0, collisions: [] };

      document.querySelectorAll('.jxgbox, .architecture-diagram').forEach((board, boardIdx) => {
        results.boards++;
        const boardId = board.id || `svg-unnamed-${boardIdx}`;
        const svg = board.matches('svg') ? board : board.querySelector('svg');
        if (!svg) return;

        // Text rects: JSXGraph wraps each `board.create('text', ...)` in an
        // HTML element with class `JXGtext` placed absolutely inside the
        // .jxgbox container. That wrapper's bounding rect is the full label
        // rect regardless of how KaTeX subdivides its internals — so we target
        // `.JXGtext` exclusively. Fallback: raw <text> nodes inside the SVG
        // (used when useKatex is false).
        const keptTexts = [];
        board.querySelectorAll('.JXGtext').forEach((el) => {
          if (svg.contains(el)) return;
          if (!el.textContent || !el.textContent.trim()) return;
          const r = rectOf(el);
          if (r.width < 2 || r.height < 2) return;
          keptTexts.push({ el, rect: r, text: el.textContent.trim().slice(0, 60) });
        });
        svg.querySelectorAll('text').forEach((el) => {
          if (el.closest('defs') || el.closest('[data-collision-ignore="true"]')) return;
          if (!el.textContent || !el.textContent.trim()) return;
          const r = rectOf(el);
          if (r.width < 2 || r.height < 2) return;
          keptTexts.push({ el, rect: r, text: el.textContent.trim().slice(0, 60) });
        });
        results.totalTexts += keptTexts.length;

        // Segments (SVG <line>): keep actual endpoints in viewport pixel coords.
        const segments = [];
        svg.querySelectorAll('line').forEach((el) => {
          if (el.closest('defs') || el.closest('[data-collision-ignore="true"]')) return;
          const x1 = parseFloat(el.getAttribute('x1')) || 0;
          const y1 = parseFloat(el.getAttribute('y1')) || 0;
          const x2 = parseFloat(el.getAttribute('x2')) || 0;
          const y2 = parseFloat(el.getAttribute('y2')) || 0;
          const a = toViewport(el, x1, y1);
          const b = toViewport(el, x2, y2);
          segments.push({ el, a, b });
        });

        // Area-like primitives: bbox overlap is a good-enough proxy for the
        // simple filled shapes used by the supported renderers.
        const areas = [];
        ['polygon', 'circle', 'ellipse', 'rect'].forEach((tag) => {
          svg.querySelectorAll(tag).forEach((el) => {
            if (el.closest('defs') || el.closest('[data-collision-ignore="true"]')) return;
            const r = rectOf(el);
            if (r.width < 1 && r.height < 1) return;
            areas.push({ el, rect: r, tag });
          });
        });

        // Paths and polylines may be filled areas, stroked geometry, or both.
        // Keep those roles separate so an open route is checked along the
        // route rather than against the empty interior of its bounding box.
        const strokedGeometries = [];
        ['path', 'polyline'].forEach((tag) => {
          svg.querySelectorAll(tag).forEach((el) => {
            if (el.closest('defs') || el.closest('[data-collision-ignore="true"]')) return;
            const style = getComputedStyle(el);
            const fillOpacity = parseFloat(style.fillOpacity || '1');
            const strokeOpacity = parseFloat(style.strokeOpacity || '1');
            const hasFill = style.fill !== 'none' && fillOpacity > 0;
            const hasStroke = style.stroke !== 'none' && strokeOpacity > 0;
            const r = rectOf(el);
            if (hasFill && (r.width >= 1 || r.height >= 1)) {
              areas.push({ el, rect: r, tag });
            }
            if (hasStroke && typeof el.getTotalLength === 'function') {
              strokedGeometries.push({ el, tag });
            }
          });
        });

        function strokeLengthInsideText(el, textRect) {
          const ctm = el.getScreenCTM();
          if (!ctm) return 0;
          const style = getComputedStyle(el);
          const strokeWidth = parseFloat(style.strokeWidth || '1') || 1;
          const scaleX = Math.hypot(ctm.a, ctm.b);
          const scaleY = Math.hypot(ctm.c, ctm.d);
          const maxScale = Math.max(scaleX, scaleY, 0.001);
          const pad = strokeWidth * maxScale / 2 + 0.75;
          const expanded = {
            left: textRect.left - pad,
            top: textRect.top - pad,
            right: textRect.right + pad,
            bottom: textRect.bottom + pad,
          };
          const total = el.getTotalLength();
          if (!Number.isFinite(total) || total <= 0) return 0;
          // Sample densely enough that the connecting segments are at most
          // about 1.5 viewport pixels long, then clip those segments exactly.
          const step = Math.max(0.25, 1.5 / maxScale);
          let prevLocal = el.getPointAtLength(0);
          let prev = toViewport(el, prevLocal.x, prevLocal.y);
          let inside = 0;
          for (let distance = step; distance < total + step; distance += step) {
            const local = el.getPointAtLength(Math.min(distance, total));
            const point = toViewport(el, local.x, local.y);
            inside += lineLengthInsideRect(prev.x, prev.y, point.x, point.y, expanded);
            prev = point;
          }
          return inside;
        }

        for (const t of keptTexts) {
          const tArea = area(t.rect);
          if (tArea <= 0) continue;

          // Rect-rect overlap for area-like drawings.
          for (const d of areas) {
            const ov = overlap(t.rect, d.rect);
            if (ov <= 0) continue;
            if (ov / tArea < overlapRatio) continue;
            results.collisions.push({
              board: boardId,
              text: t.text,
              primitive: d.tag,
              overlapRatio: +(ov / tArea).toFixed(2),
              textBbox: [Math.round(t.rect.left), Math.round(t.rect.top), Math.round(t.rect.right), Math.round(t.rect.bottom)],
            });
          }

          // Proper segment-rect clipping for <line>: a line whose bbox
          // encloses the text but whose actual segment doesn't enter the
          // text rect is fine.
          for (const s of segments) {
            const len = lineLengthInsideRect(s.a.x, s.a.y, s.b.x, s.b.y, t.rect);
            if (len <= 0) continue;
            // Require at least ~20% of the shorter text dimension of clipped
            // length, to tolerate anti-aliasing nudges.
            const threshold = Math.min(t.rect.width, t.rect.height) * overlapRatio;
            if (len < threshold) continue;
            results.collisions.push({
              board: boardId,
              text: t.text,
              primitive: 'line',
              overlapRatio: +(len / Math.min(t.rect.width, t.rect.height)).toFixed(2),
              textBbox: [Math.round(t.rect.left), Math.round(t.rect.top), Math.round(t.rect.right), Math.round(t.rect.bottom)],
            });
          }

          // Geometry-aware clipping for unfilled/outlined paths and
          // polylines. This catches a path crossing a label without treating
          // the empty part of a curved path's bbox as ink.
          for (const g of strokedGeometries) {
            const len = strokeLengthInsideText(g.el, t.rect);
            if (len <= 0) continue;
            const threshold = Math.min(t.rect.width, t.rect.height) * overlapRatio;
            if (len < threshold) continue;
            results.collisions.push({
              board: boardId,
              text: t.text,
              primitive: g.tag,
              overlapRatio: +(len / Math.min(t.rect.width, t.rect.height)).toFixed(2),
              textBbox: [Math.round(t.rect.left), Math.round(t.rect.top), Math.round(t.rect.right), Math.round(t.rect.bottom)],
            });
          }
        }
      });

      return results;
    }, OVERLAP_RATIO);

    await browser.close();
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);

    let failed = false;
    if (jsErrors.length > 0) {
      for (const e of jsErrors) console.error(`  JS error: ${e}`);
      console.error(`FAIL: ${jsErrors.length} JavaScript error(s) occurred while rendering SVG boards.`);
      failed = true;
    }

    if (report.collisions.length > 0) {
      for (const c of report.collisions) {
        console.error(
          `  COLLISION: "${c.text}" overlaps <${c.primitive}> on SVG board #${c.board} ` +
            `(ratio=${c.overlapRatio}) at [${c.textBbox.join(',')}]`
        );
      }
      console.error(`FAIL: ${report.collisions.length} text/drawing collision(s) across ${report.boards} SVG board(s).`);
      failed = true;
    }

    if (failed) process.exit(1);

    console.log(`OK: ${report.totalTexts} text labels across ${report.boards} SVG board(s) — no collisions.`);
    process.exit(0);
  } catch (err) {
    await browser.close();
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    throw err;
  }
}

main().catch((err) => {
  console.error('Verification error:', err.message);
  process.exit(1);
});
