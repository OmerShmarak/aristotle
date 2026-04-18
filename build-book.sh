#!/usr/bin/env bash
set -euo pipefail

# Build book.html from chapter markdown files in a breakdown directory
# Usage: ./build-book.sh <breakdown-dir>
# Example: ./build-book.sh machine-learning

if [ $# -lt 1 ]; then
  echo "Usage: $0 <breakdown-directory>" >&2
  echo "Example: $0 machine-learning" >&2
  exit 1
fi

BREAKDOWN_DIR="$(cd "$1" && pwd)"
CHAPTERS_DIR="$BREAKDOWN_DIR/chapters"
OUTLINE="$BREAKDOWN_DIR/outline.md"
OUTPUT="$BREAKDOWN_DIR/book.html"

# Verify pandoc exists
if ! command -v pandoc &>/dev/null; then
  echo "Error: pandoc is required but not installed." >&2
  exit 1
fi

if [ ! -d "$CHAPTERS_DIR" ]; then
  echo "Error: No chapters/ directory found in $BREAKDOWN_DIR" >&2
  exit 1
fi

# All renderer CDN scripts (included unconditionally — unused scripts are harmless)
CDN_SCRIPTS='<script src="https://cdn.jsdelivr.net/npm/roughjs@4.6.6/bundled/rough.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.js"></script>
<script src="https://cdn.jsdelivr.net/npm/vexflow@5.0.0/build/cjs/vexflow.js"></script>'

# Extract title from outline H1 if available, else use directory name
if [ -f "$OUTLINE" ]; then
  TITLE=$(grep -m1 '^# ' "$OUTLINE" | sed 's/^# //')
else
  TITLE="$(basename "$BREAKDOWN_DIR" | tr '-' ' ')"
fi

# Collect chapter files in order
CHAPTER_FILES=($(ls "$CHAPTERS_DIR"/*.md | sort))
NUM_CHAPTERS=${#CHAPTER_FILES[@]}

if [ "$NUM_CHAPTERS" -eq 0 ]; then
  echo "Error: No .md files found in $CHAPTERS_DIR" >&2
  exit 1
fi

SUBTITLE="A breakdown in $NUM_CHAPTERS chapters"
echo "Building book from $NUM_CHAPTERS chapters..."

# --- Build TOC and chapters ---
TOC_HTML=""
CHAPTERS_HTML=""

for i in "${!CHAPTER_FILES[@]}"; do
  FILE="${CHAPTER_FILES[$i]}"
  CHAPTER_NUM=$((i + 1))
  CHAPTER_ID="ch-$(printf '%02d' "$CHAPTER_NUM")"

  # Extract title from first H1 line
  CHAPTER_TITLE=$(grep -m1 '^# ' "$FILE" | sed 's/^# //')

  # Build TOC entry
  TOC_HTML="$TOC_HTML    <li><a href=\"#${CHAPTER_ID}\"><span class=\"num\">${CHAPTER_NUM}.</span> ${CHAPTER_TITLE}</a></li>
"

  # Convert markdown to HTML fragment via pandoc
  BODY=$(pandoc --from=markdown --to=html5 --syntax-highlighting=none "$FILE")

  # Remove the first <h1> from body (we'll add it as the chapter header)
  BODY=$(echo "$BODY" | sed '0,/<h1[^>]*>.*<\/h1>/s///')

  CHAPTERS_HTML="$CHAPTERS_HTML
<section class=\"chapter\" id=\"${CHAPTER_ID}\">
  <h1>Chapter ${CHAPTER_NUM}: ${CHAPTER_TITLE}</h1>
${BODY}
  <div class=\"back-to-top\"><a href=\"#toc\">&uarr; Contents</a></div>
</section>
"
  echo "  [$CHAPTER_NUM/$NUM_CHAPTERS] $CHAPTER_TITLE"
done

# --- Write the final HTML ---
cat > "$OUTPUT" <<HTMLEOF
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${TITLE}</title>
${CDN_SCRIPTS}
<style>
:root {
  --bg: #faf8f4;
  --text: #2c2c2c;
  --muted: #6b6b6b;
  --accent: #8b4513;
  --border: #e0dcd4;
  --code-bg: #f0ede6;
  --blockquote-border: #c4a87c;
}

*, *::before, *::after { box-sizing: border-box; }

html {
  font-size: 18px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  font-family: Georgia, 'Times New Roman', serif;
  line-height: 1.68;
  color: var(--text);
  background: var(--bg);
  margin: 0;
  padding: 0;
}

.container {
  max-width: 680px;
  margin: 0 auto;
  padding: 3rem 1.5rem 6rem;
}

.title-page {
  text-align: center;
  padding: 6rem 0 4rem;
  border-bottom: 1px solid var(--border);
  margin-bottom: 3rem;
}

.title-page h1 {
  font-size: 2.6rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.2;
  margin: 0 0 0.5rem;
  color: var(--text);
}

.title-page .subtitle {
  font-style: italic;
  color: var(--muted);
  font-size: 1.1rem;
  margin-top: 1rem;
}

.toc {
  margin-bottom: 3rem;
  padding-bottom: 3rem;
  border-bottom: 1px solid var(--border);
}

.toc h2 {
  font-size: 1.4rem;
  font-weight: 700;
  margin-bottom: 1.2rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
  font-family: -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif;
}

.toc ol {
  list-style: none;
  padding: 0;
  margin: 0;
}

.toc li {
  margin: 0.45rem 0;
  line-height: 1.5;
}

.toc a {
  color: var(--text);
  text-decoration: none;
  border-bottom: 1px solid var(--border);
  transition: border-color 0.15s;
}

.toc a:hover {
  border-bottom-color: var(--accent);
  color: var(--accent);
}

.toc .num {
  display: inline-block;
  width: 2.2rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.chapter {
  margin-top: 4rem;
  padding-top: 3rem;
  border-top: 1px solid var(--border);
}

.chapter:first-of-type {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}

h1, h2, h3, h4, h5, h6 {
  font-weight: 700;
  line-height: 1.25;
  margin-top: 2.2rem;
  margin-bottom: 0.8rem;
}

.chapter > h1:first-child {
  font-size: 1.9rem;
  color: var(--text);
  margin-top: 0;
  margin-bottom: 1.5rem;
  padding-bottom: 0.6rem;
  border-bottom: 2px solid var(--accent);
}

h2 { font-size: 1.35rem; }
h3 { font-size: 1.15rem; }
h4 { font-size: 1rem; font-style: italic; }

p {
  margin: 0 0 1.1rem;
  hanging-punctuation: first;
}

a { color: var(--accent); }
strong { font-weight: 700; }
em { font-style: italic; }

ul, ol {
  padding-left: 1.5rem;
  margin: 0 0 1.1rem;
}

li { margin-bottom: 0.35rem; }
li > ul, li > ol { margin-top: 0.3rem; margin-bottom: 0.3rem; }

blockquote {
  margin: 1.5rem 0;
  padding: 0.8rem 1.2rem;
  border-left: 3px solid var(--blockquote-border);
  background: rgba(0,0,0,0.015);
  color: var(--text);
  font-style: italic;
}

blockquote p:last-child { margin-bottom: 0; }

code {
  font-family: 'SF Mono', 'Fira Code', 'Fira Mono', Menlo, Consolas, monospace;
  font-size: 0.85em;
  background: var(--code-bg);
  padding: 0.15em 0.35em;
  border-radius: 3px;
}

pre {
  background: var(--code-bg);
  padding: 1.2rem 1.4rem;
  border-radius: 4px;
  overflow-x: auto;
  margin: 1.5rem 0;
  line-height: 1.45;
  border: 1px solid var(--border);
}

pre code {
  background: none;
  padding: 0;
  font-size: 0.82rem;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin: 1.5rem 0;
  font-size: 0.92rem;
}

th, td {
  text-align: left;
  padding: 0.55rem 0.8rem;
  border-bottom: 1px solid var(--border);
}

th {
  font-weight: 700;
  border-bottom: 2px solid var(--border);
  font-family: -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif;
  font-size: 0.82rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
}

hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 2.5rem 0;
}

.drawing-inline {
  margin: 2rem 0;
  padding: 1rem 0;
}

.drawings-section {
  margin-top: 2.5rem;
  padding-top: 1.5rem;
  border-top: 1px dashed var(--border);
}

.drawing-title {
  font-family: 'Comic Sans MS', cursive, sans-serif;
  color: var(--accent);
  font-size: 1.1rem;
  margin-bottom: 0.5rem;
}

.caption {
  text-align: center;
  font-style: italic;
  color: var(--muted);
  font-size: 0.9rem;
}

canvas {
  display: block;
  margin: 1rem auto 2rem;
  max-width: 100%;
}

.back-to-top {
  margin-top: 2.5rem;
  padding-top: 1rem;
  font-size: 0.85rem;
}

.back-to-top a {
  color: var(--muted);
  text-decoration: none;
}

.back-to-top a:hover {
  color: var(--accent);
}

@media print {
  body { background: #fff; font-size: 11pt; }
  .container { max-width: 100%; padding: 0; }
  .title-page { padding: 2rem 0; }
  .chapter { page-break-before: always; }
  .chapter:first-of-type { page-break-before: avoid; }
  .toc { page-break-after: always; }
  a { color: inherit; text-decoration: none; }
  pre { border: 1px solid #ccc; }
  h1, h2, h3 { page-break-after: avoid; }
  canvas { max-width: 100%; }
  .back-to-top { display: none; }
}

@media (max-width: 720px) {
  html { font-size: 16px; }
  .container { padding: 2rem 1rem 4rem; }
  .title-page { padding: 3rem 0 2rem; }
  .title-page h1 { font-size: 2rem; }
}
</style>
</head>
<body>
<div class="container">

<div class="title-page">
  <h1>${TITLE}</h1>
  <p class="subtitle">${SUBTITLE}</p>
</div>

<div class="toc" id="toc">
  <h2>Contents</h2>
  <ol>
${TOC_HTML}  </ol>
</div>

${CHAPTERS_HTML}

</div>
</body>
</html>
HTMLEOF

echo "Done: $OUTPUT ($NUM_CHAPTERS chapters)"
echo "File size: $(du -h "$OUTPUT" | cut -f1)"
