#!/usr/bin/env node
/**
 * html-to-kindle — Convert an HTML book (with <canvas> illustrations) to a Kindle-compatible EPUB.
 *
 * Kindle accepts standard EPUB3 files via Send to Kindle (email, web, or app).
 * This script produces a clean EPUB3 with conservative CSS for Kindle's renderer.
 *
 * Requires: puppeteer (npm install), pandoc
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const HELP = `html-to-kindle — Convert HTML to Kindle-compatible EPUB

Usage:
  html-to-kindle <input.html> <output.epub> [--title "Title"] [--verify]

Arguments:
  input.html               Path to the source HTML file (required)
  output.epub              Path for the generated EPUB (required)

Options:
  --title "Book Title"     Book title metadata (default: <title> from HTML)
  --verify                 After conversion, open the EPUB in a browser to
                           visually verify the output (extracts and serves
                           the XHTML content locally)
  -h, --help               Show this help

What it does:
  1. Renders the HTML in a headless browser so JavaScript-drawn canvases
     are fully painted before capture.
  2. Converts every <canvas> to an inline PNG <img>.
  3. Strips all web-specific CSS; applies minimal Kindle-safe CSS.
  4. Runs pandoc to generate an EPUB 3 with TOC and chapter splitting.

Sending to Kindle:
  - Email the .epub to your Kindle's @kindle.com address
  - Or use https://www.amazon.com/sendtokindle
  - Or drag into the Send to Kindle desktop app

Examples:
  html-to-kindle book.html book.epub
  html-to-kindle book.html out.epub --title "My Book" --verify
`;

// --- Parse args ---
function parseArgs(argv) {
  const args = { positional: [], title: null, verify: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { args.help = true; }
    else if (a === '--verify') { args.verify = true; }
    else if (a === '--title') {
      args.title = argv[++i];
      if (!args.title) fail('--title requires a value');
    }
    else if (a.startsWith('-')) { fail(`Unknown option: ${a}`); }
    else { args.positional.push(a); }
  }
  return args;
}

function fail(msg) {
  console.error(`Error: ${msg}`);
  console.error(`Run with --help for usage.`);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));

if (args.help) { console.log(HELP); process.exit(0); }
if (args.positional.length === 0) { console.log(HELP); process.exit(0); }
if (args.positional.length < 2) fail('Both <input.html> and <output.epub> are required.');
if (args.positional.length > 2) fail(`Unexpected extra argument: ${args.positional[2]}`);

const inputPath = path.resolve(args.positional[0]);
const outputPath = path.resolve(args.positional[1]);

if (!fs.existsSync(inputPath)) fail(`Input file not found: ${inputPath}`);
if (!inputPath.match(/\.html?$/i)) fail(`Input must be an HTML file (got: ${path.basename(inputPath)})`);

// Verify pandoc is available
try { execSync('pandoc --version', { stdio: 'ignore' }); }
catch { fail('pandoc is not installed. See https://pandoc.org/installing.html'); }

// --- Convert ---
(async () => {
  const tempHtml = outputPath + '.tmp.html';
  const tempCss = outputPath + '.tmp.css';

  console.log(`Converting ${path.basename(inputPath)} → ${path.basename(outputPath)}`);

  // 1. Render in headless browser
  console.log('[1/3] Rendering HTML (canvases will be drawn)...');
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 800, height: 600 });
  await page.goto(`file://${inputPath}`, { waitUntil: 'networkidle0', timeout: 120000 });

  // Wait for canvas drawing to complete. Poll until pixel data stabilizes.
  await page.evaluate(async () => {
    const hashCanvas = c => {
      try {
        const d = c.toDataURL('image/png');
        return d.length + ':' + d.slice(-64);
      } catch { return 'err'; }
    };
    const snapshot = () => Array.from(document.querySelectorAll('canvas')).map(hashCanvas).join('|');
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    let prev = snapshot();
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      const now = snapshot();
      if (now === prev && now.length > 0) return;
      prev = now;
    }
    await new Promise(r => setTimeout(r, 2000));
  });

  // 2. Rewrite DOM: canvases → images, strip styles, unwrap container
  const { canvasCount, docTitle } = await page.evaluate(() => {
    const docTitle = document.title || '';
    let canvasCount = 0;
    document.querySelectorAll('canvas').forEach(canvas => {
      try {
        const img = document.createElement('img');
        img.src = canvas.toDataURL('image/png');
        img.alt = canvas.id || 'illustration';
        canvas.parentNode.replaceChild(img, canvas);
        canvasCount++;
      } catch {}
    });
    document.querySelectorAll('script').forEach(s => s.remove());
    document.querySelectorAll('style').forEach(s => s.remove());
    document.querySelectorAll('link[rel="stylesheet"]').forEach(l => l.remove());
    document.querySelectorAll('[style]').forEach(el => el.removeAttribute('style'));
    const container = document.querySelector('.container');
    if (container) {
      while (container.firstChild) container.parentNode.insertBefore(container.firstChild, container);
      container.remove();
    }
    return { canvasCount, docTitle };
  });

  console.log(`       ${canvasCount} canvases converted to PNG`);

  fs.writeFileSync(tempHtml, await page.content(), 'utf-8');
  await browser.close();

  // 3. Kindle-safe CSS — conservative subset that Kindle renders reliably.
  //    Avoids: flexbox, grid, calc(), viewport units, position: fixed.
  //    Uses relative font sizes so Kindle's font-size slider works.
  fs.writeFileSync(tempCss, `
img {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0.8em auto;
}
pre {
  font-size: 0.8em;
  padding: 0.5em;
  overflow-wrap: break-word;
  white-space: pre-wrap;
}
code {
  font-size: 0.85em;
}
blockquote {
  margin: 0.8em 0 0.8em 1em;
  padding-left: 0.5em;
  border-left: 2px solid #999;
}
table {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.9em;
}
th, td {
  border: 1px solid #ccc;
  padding: 0.4em 0.6em;
  text-align: left;
}
`);

  // 4. Pandoc conversion
  const title = args.title || docTitle || path.basename(inputPath, path.extname(inputPath));
  console.log(`[2/3] Building EPUB (title: "${title}")...`);

  try {
    execSync(
      `pandoc "${tempHtml}" -o "${outputPath}" ` +
      `--metadata title="${title.replace(/"/g, '\\"')}" ` +
      `--toc --toc-depth=1 ` +
      `--css="${tempCss}" ` +
      `--split-level=1 ` +
      `--embed-resources --standalone`,
      { stdio: ['ignore', 'ignore', 'inherit'], timeout: 120000 }
    );
  } catch (e) {
    fs.unlinkSync(tempHtml);
    fs.unlinkSync(tempCss);
    fail(`Pandoc failed: ${e.message}`);
  }

  fs.unlinkSync(tempHtml);
  fs.unlinkSync(tempCss);

  // 5. Report
  const stats = fs.statSync(outputPath);
  const sizeStr = stats.size > 1024 * 1024
    ? `${(stats.size / 1024 / 1024).toFixed(1)} MB`
    : `${(stats.size / 1024).toFixed(0)} KB`;
  try {
    const listing = execSync(`unzip -l "${outputPath}" 2>/dev/null`).toString();
    const pngCount = (listing.match(/\.png/g) || []).length;
    const xhtmlCount = (listing.match(/\.xhtml/g) || []).length;
    console.log(`[3/3] Done.`);
    console.log(`       ${outputPath}`);
    console.log(`       ${sizeStr} · ${pngCount} images · ${xhtmlCount} sections`);
  } catch {
    console.log(`[3/3] Done: ${outputPath} (${sizeStr})`);
  }

  // 6. Verification — extract EPUB and open in browser
  if (args.verify) {
    await verifyInBrowser(outputPath);
  }
})().catch(e => {
  console.error('Unexpected error:', e.message);
  process.exit(1);
});

/**
 * Extract the EPUB (it's a zip), find all XHTML chapter files,
 * stitch them into a single HTML page, and open it in the default browser.
 * This gives a rough visual preview of what Kindle will render.
 */
async function verifyInBrowser(epubPath) {
  const os = require('os');
  const verifyDir = path.join(os.tmpdir(), `kindle-verify-${process.pid}`);
  const verifyHtml = path.join(verifyDir, 'preview.html');

  console.log('\n[verify] Extracting EPUB for preview...');
  fs.mkdirSync(verifyDir, { recursive: true });
  execSync(`unzip -o -q "${epubPath}" -d "${verifyDir}"`);

  // Find all xhtml files (chapters) in order
  const findXhtml = (dir) => {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) results.push(...findXhtml(full));
      else if (entry.name.endsWith('.xhtml')) results.push(full);
    }
    return results.sort();
  };

  const xhtmlFiles = findXhtml(verifyDir);
  if (xhtmlFiles.length === 0) {
    console.log('[verify] No XHTML files found in EPUB. Skipping.');
    return;
  }

  // Extract body content from each xhtml and combine
  const bodies = xhtmlFiles.map(f => {
    const content = fs.readFileSync(f, 'utf-8');
    const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return bodyMatch ? bodyMatch[1] : '';
  });

  // Collect any CSS files from the EPUB
  const findCss = (dir) => {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) results.push(...findCss(full));
      else if (entry.name.endsWith('.css')) results.push(full);
    }
    return results;
  };
  const cssContent = findCss(verifyDir).map(f => fs.readFileSync(f, 'utf-8')).join('\n');

  // Convert relative image paths to absolute file:// URLs
  const combinedBody = bodies.join('\n<hr style="margin:2em 0;border:2px solid #ccc">\n')
    .replace(/src="([^"]+)"/g, (match, src) => {
      if (src.startsWith('data:') || src.startsWith('http')) return match;
      // Try to find the image file relative to any xhtml location
      for (const xf of xhtmlFiles) {
        const resolved = path.resolve(path.dirname(xf), src);
        if (fs.existsSync(resolved)) return `src="file://${resolved}"`;
      }
      return match;
    });

  const previewPage = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kindle Preview</title>
<style>
  body {
    font-family: Georgia, serif;
    max-width: 700px;
    margin: 0 auto;
    padding: 2em;
    background: #fff;
    color: #333;
    font-size: 18px;
    line-height: 1.6;
  }
  .banner {
    background: #232f3e;
    color: #ff9900;
    padding: 0.8em 1em;
    margin: -2em -2em 2em;
    font-family: sans-serif;
    font-size: 0.85em;
  }
  ${cssContent}
</style>
</head><body>
<div class="banner">Kindle EPUB Preview — approximate rendering. Send to a real Kindle for final verification.</div>
${combinedBody}
</body></html>`;

  fs.writeFileSync(verifyHtml, previewPage);

  // Open in default browser
  const openCmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start'
    : 'xdg-open';
  execSync(`${openCmd} "${verifyHtml}"`);
  console.log(`[verify] Preview opened in browser: ${verifyHtml}`);
}
