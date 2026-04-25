#!/usr/bin/env node
// Verify that text labels don't overlap with drawings on JSXGraph SVG boards.
// Usage: node verifiers/verify-svg-collisions.js <breakdown-dir> <chapter-file.md>
//
// Approach: render the chapter in a headless browser, locate every .jxgbox
// container, collect bounding rects (via getBoundingClientRect) of:
//   - text overlays JSXGraph drops beside the SVG (HTML divs/spans; where
//     KaTeX output lives when useKatex:true)
//   - <text> nodes inside the SVG itself (non-KaTeX fallback)
//   - drawing primitives inside the SVG (<line>, <path>, <polyline>,
//     <polygon>, <circle>, <ellipse>, <rect>)
// A "collision" is a significant rectangular overlap between a text rect and
// a drawing rect — significant meaning the overlap area exceeds 20% of the
// text's area. Corner-touches and anti-aliasing nudges are tolerated.
//
// Cleanly no-ops when a chapter has no .jxgbox boards (same contract as
// verify-collisions.js when a chapter has no canvases).
//
// Exit code 0 = no collisions (or no boards). Non-zero = collisions found.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const puppeteer = require('puppeteer');

const OVERLAP_RATIO = 0.2; // overlap area / text area

function buildCdnTags() {
  return [
    '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css">',
    '<script src="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.js"></script>',
    '<script src="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/contrib/auto-render.min.js"></script>',
    '<script src="https://cdn.jsdelivr.net/npm/roughjs@4.6.6/bundled/rough.min.js"></script>',
    '<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.js"></script>',
    '<script src="https://cdn.jsdelivr.net/npm/vexflow@5.0.0/build/cjs/vexflow.js"></script>',
    '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/jsxgraph@1.12.2/distrib/jsxgraph.css">',
    '<script src="https://cdn.jsdelivr.net/npm/jsxgraph@1.12.2/distrib/jsxgraphcore.js"></script>',
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

    const boardCount = await page.evaluate(() => document.querySelectorAll('.jxgbox').length);
    if (boardCount === 0) {
      console.log('No JSXGraph boards found in chapter.');
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

      // A "line-like" drawing (SVG <line>) uses exact segment-vs-rect; "area"
      // drawings (polygon/path/circle/ellipse/rect) use bbox overlap.
      const results = { boards: 0, totalTexts: 0, collisions: [] };

      document.querySelectorAll('.jxgbox').forEach((board, boardIdx) => {
        results.boards++;
        const boardId = board.id || `jxg-unnamed-${boardIdx}`;
        const svg = board.querySelector('svg');
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
          if (!el.textContent || !el.textContent.trim()) return;
          const r = rectOf(el);
          if (r.width < 2 || r.height < 2) return;
          keptTexts.push({ el, rect: r, text: el.textContent.trim().slice(0, 60) });
        });
        results.totalTexts += keptTexts.length;

        // Segments (SVG <line>): keep actual endpoints in viewport pixel coords.
        const segments = [];
        svg.querySelectorAll('line').forEach((el) => {
          const x1 = parseFloat(el.getAttribute('x1')) || 0;
          const y1 = parseFloat(el.getAttribute('y1')) || 0;
          const x2 = parseFloat(el.getAttribute('x2')) || 0;
          const y2 = parseFloat(el.getAttribute('y2')) || 0;
          const a = toViewport(el, x1, y1);
          const b = toViewport(el, x2, y2);
          segments.push({ el, a, b });
        });

        // Area-like primitives (polygon / path / circle / ellipse / rect /
        // polyline): bbox overlap is a good-enough proxy.
        const areas = [];
        ['polygon', 'path', 'circle', 'ellipse', 'rect', 'polyline'].forEach((tag) => {
          svg.querySelectorAll(tag).forEach((el) => {
            const r = rectOf(el);
            if (r.width < 1 && r.height < 1) return;
            areas.push({ el, rect: r, tag });
          });
        });

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
        }
      });

      return results;
    }, OVERLAP_RATIO);

    await browser.close();
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);

    if (jsErrors.length > 0) {
      for (const e of jsErrors) console.error(`  JS error: ${e}`);
    }

    if (report.collisions.length > 0) {
      for (const c of report.collisions) {
        console.error(
          `  COLLISION: "${c.text}" overlaps <${c.primitive}> on jxgbox#${c.board} ` +
            `(ratio=${c.overlapRatio}) at [${c.textBbox.join(',')}]`
        );
      }
      console.error(`FAIL: ${report.collisions.length} text/drawing collision(s) across ${report.boards} JSXGraph board(s).`);
      process.exit(1);
    }

    console.log(`OK: ${report.totalTexts} text labels across ${report.boards} JSXGraph board(s) — no collisions.`);
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
