# Aristotle

Interactive TUI that wraps Claude Code CLI to generate personalized textbooks from first principles.

## Quick start

```bash
cd cli && npm install && npm link
aristotle "quantum mechanics"
```

Requires: Claude Code CLI (`claude`), pandoc, Node 20+.

## Architecture

```
bin/aristotle.js  →  lib/engine.js  →  lib/claude.js
                          ↕
                      ui/App.js (Ink)
```

Three layers, strict separation:

- **`cli/lib/claude.js`** — Pure stream-json parser. Spawns `claude -p`, translates raw events into normalized events. Knows nothing about Aristotle.
- **`cli/lib/engine.js`** — Conversation loop. Manages session state (`--resume`), builds system prompt from `BREAKDOWN.md` + `PROFILE.md`, tracks phases (`planning` → `writing` → `idle`), detects the `%%ARISTOTLE_DONE:<path>%%` sentinel for auto-exit.
- **`cli/ui/App.js`** — Ink TUI. Streaming text, spinner, progress bar, input. All rendering, no logic.

Supporting files: `lib/tracker.js` (chapter progress counters), `lib/theme.js` (colors + ASCII art).

## Key constraint

We wrap `claude -p` (one-shot per call) rather than the Claude API directly. Users authenticate via their Claude subscription — no API keys. Each turn is a separate process linked via `--resume <sessionId>`.

## Content pipeline

`BREAKDOWN.md` is the full prompt for the inner Claude agent. It controls diagnosis, outline generation, chapter writing (parallel agents), and compilation.

`build-book.sh` compiles chapter markdown into a single `breakdown.html` via pandoc. Deterministic — no LLM involved.

`skills/` contains rendering skill docs (Rough.js, Chart.js, VexFlow) that chapter agents load on demand.

`verifiers/` contains headless-browser scripts that validate visual rendering and text/drawing collisions.

## Completion flow

After `build-book.sh` runs, the inner Claude outputs `%%ARISTOTLE_DONE:<path>%%`. The engine strips this from display, emits a `done` event with the resolved artifact path, and the TUI shows the `open` command then exits.

## File layout

```
BREAKDOWN.md          # Inner agent prompt (the product)
PROFILE.md            # Student profile (created on first run)
build-book.sh         # Markdown → HTML compiler
skills/               # Rendering skill docs for chapter agents
verifiers/            # Visual verification scripts
cli/
  bin/aristotle.js    # Entry point
  lib/claude.js       # Stream-json parser
  lib/engine.js       # Conversation loop + session mgmt
  lib/tracker.js      # Chapter progress tracking
  lib/theme.js        # Colors, ASCII art
  ui/App.js           # Ink TUI components
```
