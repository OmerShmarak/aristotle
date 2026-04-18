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
  <h1 class=\"chapter-title\">Chapter ${CHAPTER_NUM}: ${CHAPTER_TITLE}</h1>
${BODY}
  <div class=\"back-to-top\"><a href=\"#toc\">Back to contents</a></div>
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
  /* === Base === */
  *, *::before, *::after { box-sizing: border-box; }
  body {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 18px;
    line-height: 1.68;
    color: #2c2c2c;
    background: #faf8f4;
    margin: 0;
    padding: 0;
    -webkit-font-smoothing: antialiased;
  }
  .container {
    max-width: 680px;
    margin: 0 auto;
    padding: 2rem;
  }

  /* === Title page === */
  .title-page {
    text-align: center;
    padding: 4rem 0 3rem;
    border-bottom: 2px solid #8b4513;
    margin-bottom: 3rem;
  }
  .title-page h1 {
    font-size: 2.2rem;
    line-height: 1.3;
    color: #2c2c2c;
    margin: 0 0 0.5rem;
  }
  .title-page .subtitle {
    font-size: 1.1rem;
    color: #6b6b6b;
    font-style: italic;
    margin: 0;
  }

  /* === Table of Contents === */
  .toc {
    margin-bottom: 3rem;
    padding-bottom: 2rem;
    border-bottom: 1px solid #e0dcd4;
  }
  .toc h2 {
    font-size: 1.4rem;
    color: #8b4513;
    margin: 0 0 1rem;
  }
  .toc ol {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .toc li {
    margin: 0.4rem 0;
  }
  .toc a {
    color: #2c2c2c;
    text-decoration: none;
    border-bottom: 1px solid transparent;
    transition: border-color 0.2s;
  }
  .toc a:hover {
    border-bottom-color: #8b4513;
  }
  .toc .num {
    display: inline-block;
    width: 2rem;
    font-variant-numeric: tabular-nums;
    color: #6b6b6b;
  }

  /* === Chapters === */
  .chapter {
    padding-top: 2.5rem;
    margin-top: 2.5rem;
    border-top: 1px solid #e0dcd4;
  }
  .chapter:first-of-type {
    border-top: none;
    margin-top: 0;
  }
  .chapter-title {
    font-size: 1.6rem;
    line-height: 1.3;
    margin: 0 0 1.5rem;
    padding-bottom: 0.5rem;
    border-bottom: 3px solid #8b4513;
  }
  .chapter h2 {
    font-size: 1.3rem;
    margin: 2rem 0 0.8rem;
    color: #2c2c2c;
  }
  .chapter h3 {
    font-size: 1.1rem;
    margin: 1.5rem 0 0.6rem;
    color: #444;
  }
  .chapter p {
    margin: 0 0 1rem;
  }

  /* === Inline formatting === */
  strong {
    color: #8b4513;
    font-weight: 700;
  }
  em {
    font-style: italic;
  }

  /* === Lists === */
  .chapter ul, .chapter ol {
    margin: 0 0 1rem;
    padding-left: 1.5rem;
  }
  .chapter li {
    margin: 0.3rem 0;
  }

  /* === Code === */
  code {
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 0.88em;
    background: #f0ede6;
    padding: 0.15em 0.35em;
    border-radius: 3px;
  }
  pre {
    background: #f0ede6;
    padding: 1rem;
    border-radius: 6px;
    overflow-x: auto;
    margin: 0 0 1rem;
  }
  pre code {
    background: none;
    padding: 0;
    font-size: 0.85em;
  }

  /* === Blockquotes === */
  blockquote {
    border-left: 3px solid #c4a87c;
    margin: 0 0 1rem;
    padding: 0.5rem 1rem;
    font-style: italic;
    color: #555;
  }
  blockquote p {
    margin: 0;
  }

  /* === Tables === */
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 0 0 1rem;
    font-size: 0.95em;
  }
  th, td {
    border: 1px solid #e0dcd4;
    padding: 0.5rem 0.75rem;
    text-align: left;
  }
  th {
    background: #f0ede6;
    font-weight: 700;
  }

  /* === Back to top === */
  .back-to-top {
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid #e0dcd4;
    font-size: 0.85rem;
  }
  .back-to-top a {
    color: #6b6b6b;
    text-decoration: none;
  }
  .back-to-top a:hover {
    color: #8b4513;
  }

  /* === Diagrams (Rough.js) === */
  canvas {
    display: block;
    margin: 1.5rem auto;
    background: #fff;
    border-radius: 8px;
    border: 1px solid #e0dcd4;
  }
  .drawing-title {
    font-family: 'Comic Sans MS', 'Marker Felt', cursive, sans-serif;
    text-align: center;
    font-size: 0.95rem;
    color: #6b6b6b;
    margin-bottom: 0.5rem;
  }
  .caption {
    text-align: center;
    font-style: italic;
    color: #6b6b6b;
    font-size: 0.9rem;
  }

  /* === Links === */
  a {
    color: #8b4513;
  }

  /* === Print === */
  @media print {
    body { background: #fff; }
    .chapter { page-break-before: always; }
    .chapter:first-of-type { page-break-before: avoid; }
    a { color: inherit; text-decoration: none; }
    .back-to-top { display: none; }
  }

  /* === Mobile === */
  @media (max-width: 720px) {
    body { font-size: 16px; }
    .container { padding: 1rem; }
    .title-page { padding: 2rem 0 1.5rem; }
    .title-page h1 { font-size: 1.6rem; }
    .chapter-title { font-size: 1.3rem; }
  }
</style>
</head>
<body>
<div class="container">

<!-- Title page -->
<div class="title-page">
  <h1>${TITLE}</h1>
  <p class="subtitle">${SUBTITLE}</p>
</div>

<!-- Table of Contents -->
<div class="toc" id="toc">
  <h2>Contents</h2>
  <ol>
${TOC_HTML}  </ol>
</div>

<!-- Chapters -->
${CHAPTERS_HTML}

</div>
</body>
</html>
HTMLEOF

echo "Done: $OUTPUT ($NUM_CHAPTERS chapters)"
echo "File size: $(du -h "$OUTPUT" | cut -f1)"
