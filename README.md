# Aristotle

Learn everything.

## Quick start

```
npm install
cd cli && npm install && cd ..
```

Install [pandoc](https://pandoc.org/installing.html):
```
# macOS
brew install pandoc

# Windows
choco install pandoc   # or: scoop install pandoc

# Linux
sudo apt install pandoc
```

Then:

```
npx aristotle "quantum mechanics"
```

It'll ask a few quick questions to understand how you learn (first run only), diagnose what you already know, build an outline, and — once you approve — write all chapters in parallel and compile the book.

## What you get

```
quantum-mechanics/
├── outline.md          # The plan (you approve this first)
├── chapters/
│   ├── 01-what-is-learning.md
│   ├── 02-linear-regression.md
│   └── ...
└── breakdown.html           # The final product — open in a browser
```

## How it works

1. **Knowledge diagnosis** — binary-search style questions to find where your knowledge ends. No wasted chapters on stuff you already know.
2. **Outline** — a dependency chain of chapters, sized to the gap between what you know and what you want to understand. Could be 5 chapters, could be 50.
3. **Writing** — one agent per chapter, all in parallel. Each chapter: 2000-4000 words of prose (not bullet points), with inline diagrams.
4. **Compile** — `./build-book.sh quantum-mechanics/` produces `breakdown.html`.
5. **Refinement** (optional) — if you ask for it, a pass to clean up repetition, fix cross-chapter inconsistencies, kill robot-speak.

## Visuals

Chapters can include hand-drawn diagrams (Rough.js), data charts (Chart.js), and sheet music (VexFlow). The rendering skills live in `skills/renderers/` — agents read these automatically when they need a visual.

After writing, each chapter's visuals are verified automatically:
```
node verifiers/verify-render.js quantum-mechanics/ chapters/01-wave-particle.md
node verifiers/verify-collisions.js quantum-mechanics/ chapters/01-wave-particle.md
```

## Export to e-reader format

Generate EPUB files from `breakdown.html`:

```
# Kobo (.kepub.epub)
node export/html-to-kobo.js quantum-mechanics/breakdown.html quantum-mechanics.kepub.epub

# Kindle (.epub)
node export/html-to-kindle.js quantum-mechanics/breakdown.html quantum-mechanics.epub
```

These just generate the files — you still need to transfer them yourself (USB, email to `@kindle.com`, Dropbox, etc.). Add `--verify` to the Kindle script to preview in a browser.

## Files

| File | What it does |
|------|-------------|
| `cli/` | Interactive TUI — the main entry point |
| `CLAUDE.md` | Agent instructions — tells Claude to read the breakdown prompt and your profile |
| `BREAKDOWN.md` | The full prompt: how to diagnose, outline, write, refine, compile |
| `PROFILE.md` | Your background, learning style, preferences (gitignored) |
| `build-book.sh` | Compiles chapters into `breakdown.html` (needs pandoc) |
| `verifiers/verify-render.js` | Checks that diagrams actually rendered (needs puppeteer) |
| `verifiers/verify-collisions.js` | Checks that text labels don't overlap drawings on canvases |
| `export/html-to-kobo.js` | Converts `breakdown.html` to Kobo-compatible EPUB |
| `export/html-to-kindle.js` | Converts `breakdown.html` to Kindle-compatible EPUB |
| `skills/` | Rendering skill references for diagram agents |

## Requirements

- [Claude Code](https://claude.ai/claude-code)
- Node.js
- [pandoc](https://pandoc.org/installing.html)
