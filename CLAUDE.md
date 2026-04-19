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

## Debug sessions

Every `aristotle` run mints a session ID (`YYYYMMDD-HHMMSS-xxxx`) and writes three files to `~/.aristotle/sessions/<id>/`:

- `meta.json` — topic, start time, node/claude versions.
- `claude.jsonl` — raw stream-json from `claude -p`, one event per line, ISO-prefixed.
- `engine.jsonl` — every event the Engine emits to the UI, with timestamps. This is what the TUI saw.

The ID appears in the banner at launch and in the completion banner. When a user reports a bug, they can give you just the ID; read `~/.aristotle/sessions/<id>/engine.jsonl` first (it's the smallest and tells you what the UI experienced) then `claude.jsonl` if you need model-level detail. `cli/lib/session.js` owns the format.

`ARISTOTLE_EVENT_LOG=<path>` still works — it overrides the `claude.jsonl` destination for ad-hoc debugging.

## Testing workflow

**Every change runs the test suite before being declared done.** No exceptions
— even a one-line UI tweak. The TUI is fragile enough that "it looked right in
my head" fails regularly.

**Every bug fix starts with a failing test.** Before touching the code:

1. Write a fixture in `cli/tests/fixtures/<scenario>.jsonl` that scripts the
   event sequence needed to reproduce the bug (the MockEngine replays it).
2. Write a `.test.ts` in `cli/tests/` that asserts the correct behaviour.
3. Run the test, confirm it goes **red** against the unfixed code — if it's
   green before you've done anything, it isn't observing the bug.
4. Fix the code, re-run, confirm **green**.
5. Run the whole suite to catch regressions.

Tests drive the real `App` through a PTY (node-pty) with xterm-headless as the
emulator, so assertions are against the rendered cell grid — what the user
would actually see — not raw bytes. The rationale and full patterns are in
`cli/tests/CLAUDE.md` (read it before writing your first test).

### Running the tests

From `cli/`:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run tui-test
```

Run a single spec:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run tui-test -- tests/<name>.test.ts
```

If you've changed harness or mock code and your test acts strangely, clear the
SWC cache first: `rm -rf cli/.tui-test/cache`.

Node 22 is required (tui-test's node-pty doesn't build on Node 23, the
project's default runtime). `brew install node@22` puts it at
`/opt/homebrew/opt/node@22/bin/node`; the test file references that path
directly.

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
  lib/session.js      # Per-run debug session dir + meta.json
  lib/tracker.js      # Chapter progress tracking
  lib/theme.js        # Colors, ASCII art
  ui/App.js           # Ink TUI components
  tests/              # tui-test infra (see tests/CLAUDE.md)
```
