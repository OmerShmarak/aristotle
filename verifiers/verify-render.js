#!/usr/bin/env node
// Verify that all visual elements in a single chapter actually rendered.
// Usage: node verifiers/verify-render.js <breakdown-dir> <chapter-file.md>
//
// Convention: any element immediately before a .caption div is a visual
// that's expected to have rendered content.
//
// For each such element, takes a screenshot and checks if it's blank
// (all pixels the same color). Renderer-agnostic — works for canvas,
// SVG, WebGL, or anything else.
//
// Safe to run in parallel per chapter (uses temp files with PID).
// Exit code 0 = all visuals rendered. Non-zero = failures.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const puppeteer = require('puppeteer');
const sharp = require('sharp');

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

function buildHtml(breakdownDir, chapterFile) {
  const cdnTags = buildCdnTags();
  const body = execSync(`pandoc --from=markdown --to=html5 "${chapterFile}"`, {
    encoding: 'utf8',
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
${cdnTags}
<style>
  body { background: #ffffff; margin: 0; padding: 16px; }
  canvas { display: block; background: #ffffff; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

// Returns true if the screenshot is blank (uniform color).
// Uses sharp's stats() — stdev near zero across all channels = solid color.
async function isBlank(pngBuffer) {
  const { channels } = await sharp(pngBuffer).stats();
  return channels.every((c) => c.stdev < 1.0);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node verifiers/verify-render.js <breakdown-dir> <chapter-file.md>');
    process.exit(1);
  }

  const breakdownDir = path.resolve(args[0]);
  const chapterFile = path.resolve(args[1]);

  if (!fs.existsSync(chapterFile)) {
    console.error(`Chapter file not found: ${chapterFile}`);
    process.exit(1);
  }

  const tmpFile = path.join(os.tmpdir(), `verify-${path.basename(chapterFile, '.md')}-${process.pid}.html`);
  fs.writeFileSync(tmpFile, buildHtml(breakdownDir, chapterFile));

  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });

    const jsErrors = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await page.goto('file://' + tmpFile, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 2000));

    // Find all visual containers: the element right before each .caption
    const count = await page.evaluate(() => {
      let n = 0;
      document.querySelectorAll('.caption').forEach((caption) => {
        const visual = caption.previousElementSibling;
        if (!visual) return;
        visual.setAttribute('data-visual', String(n));
        n++;
      });
      return n;
    });

    if (count === 0) {
      console.log('No visuals found in chapter.');
      await browser.close();
      process.exit(0);
    }

    // Screenshot each visual and check if it's blank
    const results = [];
    for (let i = 0; i < count; i++) {
      const el = await page.$(`[data-visual="${i}"]`);
      const caption = await page.evaluate((idx) => {
        const cap = document.querySelectorAll('.caption')[idx];
        return cap ? cap.textContent.trim().substring(0, 80) : `visual #${idx}`;
      }, i);
      const id = await page.evaluate((idx) => {
        const el = document.querySelector(`[data-visual="${idx}"]`);
        return el.id || `visual-${idx}`;
      }, i);

      if (!el) {
        results.push({ id, caption, rendered: false });
        continue;
      }

      const box = await el.boundingBox();
      if (!box || box.width < 2 || box.height < 2) {
        results.push({ id, caption, rendered: false });
        continue;
      }

      const screenshot = await el.screenshot({ type: 'png' });
      const blank = await isBlank(Buffer.from(screenshot));
      results.push({ id, caption, rendered: !blank });
    }

    await browser.close();

    const failures = results.filter((v) => !v.rendered);
    if (failures.length > 0) {
      for (const v of failures) {
        console.error(`  EMPTY: "${v.id}" — ${v.caption}`);
      }
      console.error(`FAIL: ${failures.length}/${results.length} visuals did not render.`);
      process.exit(1);
    }

    console.log(`OK: ${results.length} visuals rendered.`);
    process.exit(0);
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
}

main().catch((err) => {
  console.error('Verification error:', err.message);
  process.exit(1);
});
