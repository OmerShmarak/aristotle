#!/usr/bin/env node
// Verify that text labels don't collide with drawings on canvas elements.
// Usage: node verifiers/verify-collisions.js <breakdown-dir> <chapter-file.md>
//
// Approach: renders each chapter twice — once normally (intercepting fillText
// to record text bounding boxes), once with fillText disabled (drawings only).
// Then checks whether drawn pixels exist underneath text regions.
//
// Safe to run in parallel per chapter (uses temp files with PID).
// Exit code 0 = no collisions. Non-zero = collisions found.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const puppeteer = require('puppeteer');
const sharp = require('sharp');
const { RENDERER_SCRIPTS, RENDERER_STYLES } = require('../cdn-scripts.js');

const PADDING = 2; // px tolerance around text bbox

function buildCdnTags() {
  const styles = RENDERER_STYLES.map((url) => `<link rel="stylesheet" href="${url}">`);
  const scripts = RENDERER_SCRIPTS.map((url) => `<script src="${url}"></script>`);
  return [...styles, ...scripts].join('\n');
}

function buildHtml(chapterFile, disableText) {
  const cdnTags = buildCdnTags();
  const body = execSync(`pandoc --from=markdown --to=html5 "${chapterFile}"`, {
    encoding: 'utf8',
  });

  // When disableText is true, monkey-patch fillText before any scripts run
  const patch = disableText
    ? `<script>
        CanvasRenderingContext2D.prototype.__origFillText = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function() {};
       </script>`
    : `<script>
        window.__textBoxes = {};
        (function() {
          const orig = CanvasRenderingContext2D.prototype.fillText;
          CanvasRenderingContext2D.prototype.fillText = function(text, x, y) {
            const id = this.canvas.id;
            if (!id) return orig.apply(this, arguments);
            if (!window.__textBoxes[id]) window.__textBoxes[id] = [];
            const metrics = this.measureText(text);
            const fontSize = parseFloat(this.font) || 14;
            const align = this.textAlign || 'start';
            let left = x;
            if (align === 'center') left = x - metrics.width / 2;
            else if (align === 'right' || align === 'end') left = x - metrics.width;
            window.__textBoxes[id].push({
              text: text,
              left: Math.floor(left - ${PADDING}),
              top: Math.floor(y - fontSize * 0.85 - ${PADDING}),
              right: Math.ceil(left + metrics.width + ${PADDING}),
              bottom: Math.ceil(y + fontSize * 0.25 + ${PADDING}),
            });
            return orig.apply(this, arguments);
          };
        })();
       </script>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
${patch}
${cdnTags}
<style>
  body { background: #faf8f4; margin: 0; padding: 16px; }
  canvas { display: block; background: #faf8f4; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

async function renderPage(browser, htmlContent) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });

  const tmpFile = path.join(os.tmpdir(), `collision-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(tmpFile, htmlContent);

  const jsErrors = [];
  page.on('pageerror', (err) => jsErrors.push(err.message));

  await page.goto('file://' + tmpFile, { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2000));

  if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  return { page, jsErrors };
}

function reportJsErrors(jsErrors, label) {
  if (jsErrors.length === 0) return false;
  console.error(`JS errors on ${label} (these usually mean your visual is broken):`);
  jsErrors.forEach((e) => console.error('  ' + e));
  return true;
}

// Extract raw pixel data for a region of a canvas
async function getCanvasRegion(page, canvasId, bbox) {
  return page.evaluate(
    (id, left, top, width, height) => {
      const canvas = document.getElementById(id);
      if (!canvas) return null;
      const ctx = canvas.getContext('2d');
      const data = ctx.getImageData(left, top, width, height).data;
      return Array.from(data);
    },
    canvasId,
    bbox.left,
    bbox.top,
    bbox.right - bbox.left,
    bbox.bottom - bbox.top
  );
}

// Check if a region has any non-background pixels
function hasDrawnPixels(pixelData, bgR, bgG, bgB) {
  if (!pixelData) return false;
  // threshold to account for anti-aliasing
  const threshold = 30;
  for (let i = 0; i < pixelData.length; i += 4) {
    const r = pixelData[i], g = pixelData[i + 1], b = pixelData[i + 2], a = pixelData[i + 3];
    if (a < 10) continue; // transparent
    if (
      Math.abs(r - bgR) > threshold ||
      Math.abs(g - bgG) > threshold ||
      Math.abs(b - bgB) > threshold
    ) {
      return true;
    }
  }
  return false;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node verifiers/verify-collisions.js <breakdown-dir> <chapter-file.md>');
    process.exit(1);
  }

  const breakdownDir = path.resolve(args[0]);
  const chapterFile = path.resolve(args[1]);

  if (!fs.existsSync(chapterFile)) {
    console.error(`Chapter file not found: ${chapterFile}`);
    process.exit(1);
  }

  const browser = await puppeteer.launch({ headless: true });

  try {
    // Pass 1: normal render — collect text bounding boxes
    const normalHtml = buildHtml(chapterFile, false);
    const { page: normalPage, jsErrors: errs1 } = await renderPage(browser, normalHtml);

    if (reportJsErrors(errs1, 'normal render pass')) {
      console.error('FAIL: JS errors detected — fix those before checking collisions.');
      await browser.close();
      process.exit(1);
    }

    const canvasIds = await normalPage.evaluate(() => {
      return Array.from(document.querySelectorAll('canvas[id]')).map((c) => c.id);
    });

    if (canvasIds.length === 0) {
      console.log('No canvases found in chapter.');
      await browser.close();
      process.exit(0);
    }

    const textBoxes = await normalPage.evaluate(() => window.__textBoxes || {});
    await normalPage.close();

    // Filter to canvases that have text
    const canvasesWithText = canvasIds.filter((id) => textBoxes[id] && textBoxes[id].length > 0);
    if (canvasesWithText.length === 0) {
      console.log(`${canvasIds.length} canvases found, none have text labels. OK.`);
      await browser.close();
      process.exit(0);
    }

    // Pass 2: drawings-only render (fillText disabled)
    const drawingsHtml = buildHtml(chapterFile, true);
    const { page: drawingsPage } = await renderPage(browser, drawingsHtml);

    // Background color: #faf8f4 = rgb(250, 248, 244)
    const bgR = 250, bgG = 248, bgB = 244;

    const collisions = [];

    for (const canvasId of canvasesWithText) {
      const texts = textBoxes[canvasId];
      for (const t of texts) {
        const width = t.right - t.left;
        const height = t.bottom - t.top;
        if (width <= 0 || height <= 0) continue;

        const pixels = await getCanvasRegion(drawingsPage, canvasId, t);
        if (hasDrawnPixels(pixels, bgR, bgG, bgB)) {
          collisions.push({ canvas: canvasId, text: t.text, bbox: t });
        }
      }
    }

    await drawingsPage.close();
    await browser.close();

    if (collisions.length > 0) {
      for (const c of collisions) {
        console.error(
          `  COLLISION: "${c.text}" overlaps drawing on canvas#${c.canvas} ` +
            `at [${c.bbox.left},${c.bbox.top} → ${c.bbox.right},${c.bbox.bottom}]`
        );
      }
      console.error(`FAIL: ${collisions.length} text/drawing collision(s) found.`);
      process.exit(1);
    }

    const totalTexts = Object.values(textBoxes).reduce((sum, arr) => sum + arr.length, 0);
    console.log(
      `OK: ${totalTexts} text labels across ${canvasesWithText.length} canvases — no collisions.`
    );
    process.exit(0);
  } catch (err) {
    await browser.close();
    throw err;
  }
}

main().catch((err) => {
  console.error('Verification error:', err.message);
  process.exit(1);
});
