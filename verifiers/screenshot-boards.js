#!/usr/bin/env node
// Screenshot every supported SVG board (.jxgbox or .architecture-diagram) in
// a chapter, save as PNGs to `<breakdown-dir>/_board-previews/`.
//
// Usage: node verifiers/screenshot-boards.js <breakdown-dir> <chapter-file.md>
//
// This is a visual-QA step, not a pass/fail gate: it always exits 0 (unless
// a real error occurs). Its purpose is to produce PNGs the author looks at
// before declaring a diagram done, because "no collisions" is a floor, not
// a ceiling — label placement and aesthetic issues only show up visually.
//
// Output naming: `<chapter-slug>-<board-id>.png`, e.g.
//   _board-previews/02-covariance-as-geometry-jxg-C02-centering-projection.png

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const puppeteer = require('puppeteer');
const { KATEX_HEAD, RENDERER_SCRIPTS, RENDERER_STYLES } = require('../cdn-scripts.js');

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
  body { background: #faf8f4; margin: 0; padding: 16px; font-family: Georgia, serif; }
  .jxgbox { border: none !important; background: transparent !important; }
  .architecture-diagram { background: transparent !important; }
  .JXGtext { outline: none !important; font-family: Georgia, serif !important; }
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
    console.error('Usage: node verifiers/screenshot-boards.js <breakdown-dir> <chapter-file.md>');
    process.exit(1);
  }

  const breakdownDir = path.resolve(args[0]);
  const chapterFile = path.resolve(args[1]);
  if (!fs.existsSync(chapterFile)) {
    console.error(`Chapter file not found: ${chapterFile}`);
    process.exit(1);
  }

  const outDir = path.join(breakdownDir, '_board-previews');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const chapterSlug = path.basename(chapterFile, '.md');
  const tmpFile = path.join(
    os.tmpdir(),
    `screenshot-${chapterSlug}-${process.pid}-${Math.random().toString(36).slice(2)}.html`
  );
  fs.writeFileSync(tmpFile, buildHtml(chapterFile));

  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 2000, deviceScaleFactor: 2 });

    const jsErrors = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await page.goto('file://' + tmpFile, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 2000));

    const boards = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.jxgbox, .architecture-diagram'))
        .map((b, i) => ({
          id: b.id || `svg-unnamed-${i}`,
          architecture: b.classList.contains('architecture-diagram'),
        }));
    });

    if (boards.length === 0) {
      console.log(`No supported SVG boards found in ${chapterSlug}.md — nothing to screenshot.`);
      await browser.close();
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      process.exit(0);
    }

    const written = [];
    for (const board of boards) {
      const id = board.id;
      // getElementById handles IDs with any characters; CSS-selector escaping
      // differs by environment (CSS.escape is browser-only).
      const target = await page.evaluateHandle((boardId) => document.getElementById(boardId), id);
      if (!target) continue;
      const box = await target.boundingBox();
      if (!box || box.width < 2 || box.height < 2) {
        await target.dispose();
        continue;
      }

      const outPath = path.join(outDir, `${chapterSlug}-${id}.png`);
      await target.screenshot({ path: outPath, type: 'png' });
      await target.dispose();
      written.push(path.relative(breakdownDir, outPath));
    }

    // Architectural boards are explicitly responsive. Capture a phone-width
    // preview as well so tiny labels and clipped gutters are visible during
    // QA rather than discovered after publication.
    const architecturalBoards = boards.filter((board) => board.architecture);
    if (architecturalBoards.length > 0) {
      await page.setViewport({ width: 390, height: 2000, deviceScaleFactor: 2 });
      await new Promise((r) => setTimeout(r, 250));
      for (const board of architecturalBoards) {
        const target = await page.evaluateHandle((boardId) => document.getElementById(boardId), board.id);
        if (!target) continue;
        const box = await target.boundingBox();
        if (!box || box.width < 2 || box.height < 2) {
          await target.dispose();
          continue;
        }
        const outPath = path.join(outDir, `${chapterSlug}-${board.id}-mobile.png`);
        await target.screenshot({ path: outPath, type: 'png' });
        await target.dispose();
        written.push(path.relative(breakdownDir, outPath));
      }
    }

    await browser.close();
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);

    if (jsErrors.length > 0) {
      for (const e of jsErrors) console.error(`  JS error: ${e}`);
      console.error(`FAIL: ${jsErrors.length} JavaScript error(s) occurred while rendering board previews.`);
      process.exit(1);
    }

    console.log(`Wrote ${written.length} board preview(s):`);
    for (const p of written) console.log(`  ${p}`);
    console.log('\nOpen these PNGs and compare against the "Common Pitfalls" list before shipping the chapter.');
    process.exit(0);
  } catch (err) {
    await browser.close();
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    throw err;
  }
}

main().catch((err) => {
  console.error('Screenshot error:', err.message);
  process.exit(1);
});
