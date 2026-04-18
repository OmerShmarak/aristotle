#!/usr/bin/env node
/**
 * html-to-kobo — Convert an HTML book (with <canvas> illustrations) to a Kobo-compatible EPUB.
 *
 * Requires: puppeteer (npm install), pandoc
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const HELP = `html-to-kobo — Convert HTML to Kobo-compatible EPUB

Usage:
  html-to-kobo <input.html> <output.kepub.epub> [--title "Title"]

Arguments:
  input.html               Path to the source HTML file (required)
  output.kepub.epub        Path for the generated EPUB (required)
                           Tip: use the .kepub.epub extension to enable
                           Kobo's better WebKit rendering engine.

Options:
  --title "Book Title"     Book title metadata (default: <title> from HTML)
  -h, --help               Show this help

What it does:
  1. Renders the HTML in a headless browser so JavaScript-drawn canvases
     are fully painted before capture.
  2. Converts every <canvas> to an inline PNG <img>.
  3. Strips all web-specific CSS so the e-reader controls font sizing.
  4. Runs pandoc with --toc and proper chapter splitting to generate an
     EPUB 3 with working navigation.

Examples:
  html-to-kobo book.html book.kepub.epub
  html-to-kobo book.html out.kepub.epub --title "My Neuroscience Book"
`;

// --- Parse args ---
function parseArgs(argv) {
  const args = { positional: [], title: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { args.help = true; }
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
if (args.positional.length < 2) fail('Both <input.html> and <output.kepub.epub> are required.');
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

  // Wait for canvas drawing to complete. We poll: consider canvases "done"
  // when their pixel data has stabilized across two consecutive checks.
  await page.evaluate(async () => {
    const hashCanvas = c => {
      try {
        const d = c.toDataURL('image/png');
        return d.length + ':' + d.slice(-64);
      } catch { return 'err'; }
    };
    const snapshot = () => Array.from(document.querySelectorAll('canvas')).map(hashCanvas).join('|');
    // Wait for fonts to settle, then sample until two samples match
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    let prev = snapshot();
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      const now = snapshot();
      if (now === prev && now.length > 0) return;
      prev = now;
    }
    // Safety net: 2-second final settle
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
    // Unwrap .container so e-reader width controls don't fight a fixed max-width
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

  // 3. Minimal e-reader CSS (pandoc's default handles fonts well — we only
  //    override images and code blocks).
  fs.writeFileSync(tempCss, `
img {
  display: block;
  width: 100%;
  max-width: 100%;
  height: auto;
  margin: 0.8em 0;
}
pre {
  font-size: 0.8em;
  padding: 0.5em;
  overflow-wrap: break-word;
  white-space: pre-wrap;
}
blockquote {
  margin: 0.8em 0 0.8em 1em;
  padding-left: 0.5em;
  border-left: 2px solid #999;
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
  console.log('[3/3] Done.');
  const stats = fs.statSync(outputPath);
  const sizeStr = stats.size > 1024 * 1024
    ? `${(stats.size / 1024 / 1024).toFixed(1)} MB`
    : `${(stats.size / 1024).toFixed(0)} KB`;
  try {
    const listing = execSync(`unzip -l "${outputPath}" 2>/dev/null`).toString();
    const pngCount = (listing.match(/\.png/g) || []).length;
    const xhtmlCount = (listing.match(/\.xhtml/g) || []).length;
    console.log(`       ${outputPath}`);
    console.log(`       ${sizeStr} · ${pngCount} images · ${xhtmlCount} sections`);
  } catch {
    console.log(`       ${outputPath} (${sizeStr})`);
  }
})().catch(e => {
  console.error('Unexpected error:', e.message);
  process.exit(1);
});
