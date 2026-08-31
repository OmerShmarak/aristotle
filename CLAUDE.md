# Aristotle

Interactive TUI that wraps Claude Code and Codex CLI to generate personalized textbooks from first principles.

## Quick start

```bash
cd cli && npm install && npm link
aristotle "quantum mechanics"
```

Requires: Claude Code CLI (`claude`) and/or Codex CLI (`codex`), pandoc, Node 20+.

## Architecture

```
bin/aristotle.js  →  lib/engine.js  →  lib/providers/ → claude.js / Codex.js
                          ↕
                      ui/App.js (Ink)
```

Three layers, strict separation:

- **`cli/lib/claude.js` / `cli/lib/Codex.js`** — Pure JSONL parsers. Spawn the provider CLI and translate raw events into normalized events. Know nothing about Aristotle.
- **`cli/lib/engine.js`** — Provider-neutral conversation loop. Manages per-provider resume state, builds the system prompt from `BREAKDOWN.md` + `PROFILE.md`, tracks phases (`planning` → `writing` → `idle`), and detects sentinels.
- **`cli/ui/App.js`** — Ink TUI. Streaming text, spinner, progress bar, input. All rendering, no logic.

Supporting files: `lib/tracker.js` (chapter progress counters), `lib/theme.js` (colors + ASCII art).

## Key constraint

We wrap provider CLIs rather than their APIs directly: `claude -p` or `codex exec --json`, one process per turn. Users authenticate with their existing CLI subscriptions—no Aristotle API keys. Follow-up turns use the provider's opaque resume token. `/codex` and `/claude` switch providers while keeping their tokens separate.

Each provider turn is bounded by two watchdogs (a wedged subagent once ran a turn 41h before the user noticed). The CLI is spawned `detached` in its own process group so a kill reaches its descendants too:

- **Idle** — kill the turn if the process emits no output for `ARISTOTLE_IDLE_TIMEOUT_MS` (default 10 min). Catches a silently-hung subagent.
- **Hard** — kill the turn after `ARISTOTLE_TURN_TIMEOUT_MS` total (default 60 min) regardless of activity. Backstop for a chatty runaway loop.

Set either to `0`/`off` to disable. On a timeout the engine recovers to `idle` and emits an `error`; the user can send another message. Parser adapters own process watchdogs and `lib/engine.js` supplies the limits.

## Content pipeline

`BREAKDOWN.md` is the full prompt for the inner agent. It controls diagnosis, outline generation, chapter writing (parallel agents), and compilation.

`build-book.sh` compiles chapter markdown into a single `breakdown.html` via pandoc. Deterministic — no LLM involved.

`skills/` contains rendering skill docs (Rough.js, Chart.js, VexFlow) that chapter agents load on demand.

`verifiers/` contains headless-browser scripts that validate visual rendering and text/drawing collisions.

## Completion flow

After `build-book.sh` runs, the inner agent outputs `%%ARISTOTLE_DONE:<path>%%`. The engine strips this from display, emits a `done` event with the resolved artifact path, and the TUI shows the `open` command while keeping chat open.

## Debug sessions

Every `aristotle` run mints a session ID (`YYYYMMDD-HHMMSS-xxxx`) and writes three files to `~/.aristotle/sessions/<id>/`:

- `meta.json` — topic, provider, provider version, resume token, and runtime metadata.
- `claude.jsonl` / `Codex.jsonl` — raw JSONL from each provider used in the session, one event per line, ISO-prefixed.
- `engine.jsonl` — every event the Engine emits to the UI, with timestamps. This is what the TUI saw.

The ID appears in the banner at launch. When a user reports a bug, read `engine.jsonl` first, then the active provider's raw JSONL if model-level detail is needed. `cli/lib/session.js` owns the format.

`ARISTOTLE_EVENT_LOG=<path>` overrides the active provider log destination for ad-hoc debugging.

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
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm test
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
  lib/claude.js       # Claude stream-json parser
  lib/Codex.js        # Codex JSONL parser
  lib/providers/      # Provider registry and adapters
  lib/engine.js       # Conversation loop + session mgmt
  lib/session.js      # Per-run debug session dir + meta.json
  lib/tracker.js      # Chapter progress tracking
  lib/theme.js        # Colors, ASCII art
  ui/App.js           # Ink TUI components
  tests/              # tui-test infra (see tests/CLAUDE.md)
```
