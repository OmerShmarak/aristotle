# Aristotle

Learn everything.

## Quick start

```
npm install
```

Edit `PROFILE.md` with your background, how you learn, and what you care about. Then:

```
claude
```

Tell it what you want to learn. That's it.

It will ask you a few questions to figure out what you already know, build an outline, and — once you approve — write all chapters in parallel and compile the book.

## What you get

```
machine-learning/
├── outline.md          # The plan (you approve this first)
├── chapters/
│   ├── 01-what-is-learning.md
│   ├── 02-linear-regression.md
│   └── ...
└── book.html           # The final product — open in a browser
```

## How it works

1. **Knowledge diagnosis** — binary-search style questions to find where your knowledge ends. No wasted chapters on stuff you already know.
2. **Outline** — a dependency chain of chapters, sized to the gap between what you know and what you want to understand. Could be 5 chapters, could be 50.
3. **Writing** — one agent per chapter, all in parallel. Each chapter: 2000-4000 words of prose (not bullet points), with inline diagrams.
4. **Refinement** — a pass to clean up repetition, fix cross-chapter inconsistencies, kill robot-speak.
5. **Compile** — `./build-book.sh machine-learning/` produces `book.html`.

## Visuals

Chapters can include hand-drawn diagrams (Rough.js), data charts (Chart.js), and sheet music (VexFlow). The rendering skills live in `skills/renderers/` — agents read these automatically when they need a visual.

After writing, each chapter's visuals are verified with:
```
node verifiers/verify-render.js machine-learning/ chapters/01-what-is-learning.md
```

## Send to e-reader

```
# Kobo
node ereaders/html-to-kobo.js machine-learning/book.html machine-learning.kepub.epub

# Kindle
node ereaders/html-to-kindle.js machine-learning/book.html machine-learning.epub
```

For Kindle, email the `.epub` to your `@kindle.com` address, or use [Send to Kindle](https://www.amazon.com/sendtokindle). Add `--verify` to open a browser preview before sending.

## Files

| File | What it does |
|------|-------------|
| `CLAUDE.md` | Entry point — tells Claude to read the breakdown prompt and your profile |
| `BREAKDOWN.md` | The full prompt: how to diagnose, outline, write, refine, compile |
| `PROFILE.md` | Your background, learning style, preferences (gitignored) |
| `build-book.sh` | Compiles chapters into `book.html` (needs pandoc) |
| `verifiers/verify-render.js` | Checks that diagrams actually rendered (needs puppeteer) |
| `ereaders/html-to-kobo.js` | Converts `book.html` to Kobo-compatible EPUB |
| `ereaders/html-to-kindle.js` | Converts `book.html` to Kindle-compatible EPUB |
| `skills/` | Rendering skill references for diagram agents |

## Requirements

- [Claude Code](https://claude.ai/claude-code)
- Node.js
- [pandoc](https://pandoc.org/) (`brew install pandoc`)
