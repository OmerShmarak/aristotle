# Aristotle

Understand everything.

## Quick start

```
npm install
cd cli && npm install && npm link && cd ..
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


You are ready to go!

```
aristotle "<the thing you want to understand>"
```

In my opinion - it's better to ask a specific question. It makes it so you will learn the absolute minimum to understand the answer for your question, instead of learning stuff you don't care about.

For example, instead of

```
aristotle "I want to understand aerospace engineering"
```

ask:

```
aristotle "How does a plane work?"
```

## What you get

```
how-does-a-plane-work/
├── outline.md          # The plan (you approve this first)
├── chapters/
│   ├── 01-air-has-opinions.md
│   ├── 02-how-wings-cheat-gravity.md
│   └── ...
└── breakdown.html           # The final product — open in a browser
```

When Aristotle finishes, it exits and prints the command to open your breakdown:
```
open how-does-a-plane-work/breakdown.html
```

## Design principles

1. Understanding something means having the ability to derive it from scratch.
2. Unknown Unknowns are the bottleneck for understanding, not your intelligence.



## The process

What happens when you run ```aristotle```?

1. **Current knowledge diagnosis** — Aristotle will ask you questions about what you want to learn, to figure out what your knowledge is in this domain. It will start with medium questions, and depending on your answer, it will go easier or harder with you, binary search style. The goal is to rely on fundamentals you already know, and not assume you know stuff you don't.

2. **Outline** — a dependency chain of chapters, sized to the gap between what you know and what you want to understand. Could be 5 chapters, could be 50.

3. **Writing** — one agent per chapter, all in parallel. Each chapter: 2000-4000 words of prose (not bullet points), with inline diagrams.

4. **Compile** — `./build-book.sh quantum-mechanics/` produces `breakdown.html`.

5. **Refinement** (optional) — if you ask for it, a pass to clean up repetition, fix cross-chapter inconsistencies, kill robot-speak.






## Technical Internals

### Files

| File | What it does |
|------|-------------|
| `cli/` | Interactive TUI — the main entry point |
| `CLAUDE.md` | Developer guide — architecture, layers, key constraints |
| `BREAKDOWN.md` | The full prompt: how to diagnose, outline, write, refine, compile |
| `PROFILE.md` | Your background, learning style, preferences (gitignored) |
| `build-book.sh` | Compiles chapters into `breakdown.html` (needs pandoc) |
| `verifiers/verify-render.js` | Checks that diagrams actually rendered (needs puppeteer) |
| `verifiers/verify-collisions.js` | Checks that text labels don't overlap drawings on canvases |
| `export/html-to-kobo.js` | Converts `breakdown.html` to Kobo-compatible EPUB |
| `export/html-to-kindle.js` | Converts `breakdown.html` to Kindle-compatible EPUB |
| `skills/` | Rendering skill references for diagram agents |

### Visuals

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


## Requirements

- [Claude Code](https://claude.ai/claude-code)
- Node.js
- [pandoc](https://pandoc.org/installing.html)
