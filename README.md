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

You are ready to go.

## Two ways to run it

### 1. Chat — just type `aristotle`

```
aristotle
```

Opens a free-form chat. Ask questions, get answers, drop a file with `@path` (with autocomplete), or pivot into building a full breakdown whenever you want by saying so. Chat is the right mode when you don't yet know what you want — you're poking at a topic, asking follow-ups, deciding whether it's worth a deeper dive.

In-chat keys:
- `@` — tag a file or directory; autocomplete suggests paths.
- `Ctrl+W` / `Option+Backspace` — delete previous word.
- `Ctrl+R` — resume a previous session (picker).
- `Ctrl+C` — clear the input. Press twice to exit.

### 2. Breakdown — `aristotle "<question>"`

```
aristotle "How does a plane work?"
```

Skips chat and goes straight to the breakdown pipeline: diagnoses what you already know, proposes an outline, then writes every chapter in parallel.

Prefer a specific question to a broad domain. *"How does a plane work?"* yields a tight book; *"I want to understand aerospace engineering"* yields a syllabus. Specific questions force a useful destination, and the dependency chain is automatically as deep as the gap between you and that destination requires.

### Resume

```
aristotle --resume                         # picks from a list
aristotle --resume 20260101-120000-abcd    # resume specific session
```

Every run is logged under `~/.aristotle/sessions/<id>/`. Resume continues the conversation exactly where it left off, with the same artifact directory and full message history.

## What you get

Everything lives inside `artifacts/<slug>/`, where `<slug>` is derived from your topic (e.g. `artifacts/how-does-a-plane-work/`):

| File | What it is |
|------|-----------|
| `outline.md` | The learning path — you approve this before writing starts |
| `chapters/*.md` | Each chapter answers one question that gets you one step closer to understanding the thing you asked about. Markdown, easy for LLMs to read for follow-ups |
| `breakdown.html` | The compiled book — open in a browser |

When the breakdown finishes, Aristotle prints the command to open it:
```
open artifacts/how-does-a-plane-work/breakdown.html
```

In chat mode, no artifact is produced unless you ask for one — chat just talks.

## Design principles

1. Understanding something means having the ability to derive it from scratch.
2. Unknown unknowns are the bottleneck for understanding, not your intelligence.

## The breakdown process

What happens when you run `aristotle "<question>"`:

1. **Knowledge diagnosis** — Aristotle asks a few calibrating questions to find the boundary of what you already know, binary-search style. This avoids re-teaching what you've got and avoids assuming what you haven't.

2. **Learning path** — a dependency chain of chapters, sized to the gap between what you know and what you want to understand. Could be 5 chapters, could be 50.

3. **Writing** — one agent per chapter, all in parallel. Each chapter: 2000–4000 words of flowing prose (not bullets), with inline diagrams where they teach something prose can't.

4. **Compile** — `build-book.sh artifacts/<slug>/` produces `breakdown.html`.

The chapter agents auto-verify every visual they include: render-check (does it actually paint pixels?) plus collision-check (do labels overlap drawings?). Verifiers fail on uncaught JS errors and CDN failures, so a broken visual surfaces immediately instead of shipping silently.

## Technical internals

### Files

| File | What it does |
|------|-------------|
| `cli/` | Interactive TUI — the main entry point |
| `CLAUDE.md` | Developer guide — architecture, layers, key constraints |
| `BREAKDOWN.md` | The full prompt: how to diagnose, outline, write, refine, compile |
| `PROFILE.md` | Your background, learning style, preferences (gitignored) |
| `build-book.sh` | Compiles chapters into `breakdown.html` (needs pandoc) |
| `cdn-scripts.js` | Single source of truth for renderer CDN URLs |
| `verifiers/verify-render.js` | Checks diagrams actually rendered + fails on JS errors |
| `verifiers/verify-collisions.js` | Checks text labels don't overlap drawings on canvases |
| `export/html-to-kobo.js` | Converts `breakdown.html` to Kobo EPUB |
| `export/html-to-kindle.js` | Converts `breakdown.html` to Kindle EPUB |
| `skills/` | Rendering skill references for diagram agents |

### Visuals

Chapter agents have five renderers to choose from:

| Skill | Library | Use when |
|-------|---------|----------|
| Conceptual diagrams | Rough.js | Hand-drawn structural diagrams; counterintuitive scale, comparative anatomy, causal feedback loops |
| Flow chains | Rough.js | Linear A → B → C dependency chains |
| Charts & graphs | Chart.js | Data visualizations — distributions, growth, comparisons |
| Interactive plots | Chart.js + sliders | Parameter sensitivity is the insight ("watch the curve as p drops") |
| Animated simulations | p5.js | Motion is the insight — diffusion, oscillators, sequential processes |
| 3D molecular structure | 3Dmol.js | 3D shape itself is the insight — protein folds, viral capsids, ion channels |
| Music notation | VexFlow | Specific notes, chords, melodies referenced in the chapter |

Agents read `skills/index.md` and only load the renderer files they actually need.

After writing, each chapter's visuals are verified automatically:
```
node verifiers/verify-render.js artifacts/<slug>/ chapters/01-foo.md
node verifiers/verify-collisions.js artifacts/<slug>/ chapters/01-foo.md
```

### Adding a new renderer

If you build a new renderer skill:
1. Add the CDN URL to `RENDERER_SCRIPTS` in `cdn-scripts.js`. That single file feeds `build-book.sh`, `verify-render.js`, and `verify-collisions.js` automatically.
2. Add a doc at `skills/renderers/<name>.md` mirroring an existing skill's structure.
3. Add a row to the table in `skills/index.md` so chapter agents discover it.

## Export to e-reader

Generate EPUB files from `breakdown.html`:

```
# Kobo (.kepub.epub)
node export/html-to-kobo.js artifacts/<slug>/breakdown.html <slug>.kepub.epub

# Kindle (.epub)
node export/html-to-kindle.js artifacts/<slug>/breakdown.html <slug>.epub
```

These just generate the file — you transfer it yourself (USB, send to `@kindle.com`, Dropbox, etc.). Add `--verify` to the Kindle script to preview in a browser.

## Requirements

- [Claude Code](https://claude.ai/claude-code)
- Node.js
- [pandoc](https://pandoc.org/installing.html)
