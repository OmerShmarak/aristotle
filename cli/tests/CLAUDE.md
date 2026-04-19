# Aristotle test infra

Aristotle is a terminal UI. You cannot verify it by reading stdout as plain
text — the terminal is a byte stream of ANSI/VT escape sequences, and what
matters is the **rendered screen state** after a terminal emulator interprets
those bytes. Two visually-identical screens can come from very different
byte streams; two *different* screens can share the same characters and
differ only in cursor position or rewrite ordering. You need to check what
the user would actually see.

This directory holds the infra that does that.

---

## The stack

| Layer | Library | Role |
|---|---|---|
| Process | **node-pty** (via tui-test) | Allocates a real PTY and runs aristotle under it, same as a user's terminal. No fake stdout. |
| Emulator | **@xterm/headless** (via tui-test) | Parses the PTY byte stream (VT/CSI/OSC) and maintains the cell grid — the actual "what's on screen." |
| Harness | **@microsoft/tui-test** | TypeScript test runner with Playwright-style API: `terminal.write`, `getByText`, `toBeVisible`, auto-retry waits, per-test PTY context, trace capture. |

You read the screen, not the bytes. `terminal.getViewableBuffer()` returns a
`string[][]` of cell content; `terminal.getByText(/pattern/g)` polls the cell
grid until it finds a match. Send input with `terminal.write("...")` or the
key helpers (`terminal.keyPress`, `keyCtrlC`, etc.).

Trade-off we accepted: tui-test pulls in node-pty, which is build-fragile on
bleeding-edge Node. See "Node version" below.

---

## Prerequisites

**Node 22.** tui-test supports 18/20/22/24 but not 23. The project's default
runtime is Node 23.11 (see `CLAUDE.md`), so tests are run against a separate,
keg-only Node 22:

```bash
brew install node@22
# It installs to /opt/homebrew/opt/node@22/ and is NOT symlinked into PATH.
# Your default `node` stays Node 23. Tests hand an absolute path to tui-test.
```

The test file (`static-display.test.ts`) references
`/opt/homebrew/opt/node@22/bin/node` directly in its `program.file`. If you
are on a different machine or install Node 22 elsewhere, update that constant.

---

## Running

From `cli/`:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run tui-test
```

(The `PATH` prefix is needed so tui-test's worker spawns a Node 22 process for
itself; the program under test is launched via an absolute Node 22 path from
the test file.)

Expected output on green:

```
  ✔  1 tests/static-display.test.ts:N › ...  (5.3s)
  tests: 1 passed, 1 total
```

---

## File layout

```
cli/
  bin/aristotle-test-harness.js   ← test-only entry: renders App with MockEngine
  lib/mock-engine.js              ← EventEmitter that replays an event script
  tests/
    README.md                     ← this file
    static-display.test.ts        ← tui-test spec
    fixtures/
      static-streaming.jsonl      ← event script the harness replays
  tui-test.config.ts              ← tui-test config (timeouts, reporter, trace)
```

### The harness (`bin/aristotle-test-harness.js`)

A tiny alternate entry point that renders the real `App` component with a
`MockEngine` instead of a real `Engine`. It reads the script path from the
`ARISTOTLE_SCRIPT` env var. The harness forces `interactive: true` on Ink's
`render()` call — see gotchas.

**Why not drive the real engine?** The real engine spawns `claude -p`, which
is slow (seconds to minutes), non-deterministic, costs money, and requires a
live subscription. None of that belongs in a unit-ish test about TUI
rendering. Rendering bugs are in `App.js`, not in `engine.js`, so mocking the
engine is the correct isolation boundary.

### The mock engine (`lib/mock-engine.js`)

An `EventEmitter` that extends the same event surface as the real `Engine`
(`text`, `phase`, `turn_start`, `chapters_total`, `chapter_done`, `turn_end`,
`done`, `error`). It reads a JSONL script where each line is:

```json
{"delayMs": <ms>, "event": "<name>", "payload": {<object>}}
```

Lines are replayed in order; each line waits `delayMs` *after* the previous
line before emitting. The `__exit` event name is special — it calls
`process.exit(payload.code ?? 0)` so the harness self-cleans after a run.

Example fixture (`fixtures/static-streaming.jsonl`):

```json
{"delayMs": 0, "event": "turn_start", "payload": {}}
{"delayMs": 0, "event": "phase", "payload": {"phase": "planning"}}
{"delayMs": 50, "event": "text", "payload": {"text": "Writing outline.md..."}}
{"delayMs": 100, "event": "text", "payload": {"text": "More text."}}
{"delayMs": 15000, "event": "__exit", "payload": {"code": 0}}
```

Keep the `__exit` delay well beyond your longest test timeout, otherwise the
harness process dies before assertions resolve.

### The test (`tests/static-display.test.ts`)

Uses `@microsoft/tui-test`'s `test` + `expect`. `test.use({ program: {...} })`
tells tui-test to spawn the harness instead of a shell. Each test gets its
own PTY with the specified rows/cols. Assertions run against the rendered cell
grid.

---

## Writing a new test

1. Add a new fixture `tests/fixtures/<scenario>.jsonl` that scripts the event
   stream the scenario needs. Include a final `__exit` well after your
   longest assertion timeout.
2. Add a new `.test.ts` file under `tests/`. Copy the `test.use({...})` block
   from `static-display.test.ts` and point `ARISTOTLE_SCRIPT` at your fixture.
3. Write assertions against `terminal`:
   - `await expect(terminal.getByText(/foo/g, { full: true })).toBeVisible()`
     — polls the cell grid, handles async xterm writes.
   - `terminal.getViewableBuffer()` — synchronous snapshot of visible cells.
   - `terminal.write("...")` / `terminal.submit("...")` — send input + Enter.
   - `terminal.keyPress("c", { ctrl: true })` — modified keys.
4. Run `npm run tui-test`.

Patterns that work well:
- Prove a *change* over time by looking for a state that can only exist after
  an animation tick (e.g. a specific spinner frame: `/⠙/g`).
- Prove layout by locating two adjacent strings.
- Prove input handling by `terminal.write(...)` then polling for the next
  state.

Patterns that don't:
- Comparing two `getViewableBuffer()` hashes taken close together — xterm's
  async write queue may not have drained, and you'll see stale frames.
  Use `getByText` with a polling locator instead.
- Matching strings that wrap across rows — locator matches only contiguous
  runs on a single row.

---

## Gotchas (things that cost an afternoon)

**Ink goes non-interactive in CI-ish environments.** Ink's `render()` calls
`is-in-ci`, which checks `$CI` and `$CONTINUOUS_INTEGRATION`. When either is
truthy (or even just present with `undefined` — `'CI' in env` returns true),
Ink switches to batch mode: no live redraws, no animation frames. The
harness passes `interactive: true` explicitly to Ink's `render()` to force
the real interactive path, which is what users see. Don't remove that flag
without a replacement.

**Shebangs and tui-test's SWC cache.** tui-test transpiles files through SWC
into `cli/.tui-test/cache/`, and prepends a hash comment before the source.
That pushes any `#!/usr/bin/env node` line off line 1, and Node's ESM loader
only strips shebangs from line 1 — so a shebanged harness crashes at startup
with a syntax error. The test harness deliberately has no shebang; it's
always invoked as `node <path>`.

**Regex locators need the `g` flag.** tui-test's `getByText(regex)` calls
`String.prototype.matchAll`, which throws on a non-global regex. Always
write `/pattern/g`, not `/pattern/`.

**xterm's `write()` is async.** `terminal._term.write(data)` (what tui-test
calls on PTY data) queues bytes for parsing; the buffer may not reflect them
immediately. Use `terminal.getByText(...)` with its polling timeout (set via
`expect.timeout` in the config). A single synchronous `getViewableBuffer()`
can return stale contents.

**node-pty builds fail on Node 23.** That's why we use Node 22. If a new
Node 23+ prebuild lands and works, you can simplify this.

**Text that wraps escapes the locator.** `getByText(/keep the pipeline/g)`
will miss a line where "keep the" is on row N and "pipeline" is on row N+1.
Anchor assertions on a single-line phrase.

---

## Debugging a failing test

1. **Enable trace capture** in `tui-test.config.ts`:

   ```ts
   trace: true,
   traceFolder: "tui-traces",
   ```

   Each test writes a zlib-compressed JSON file to `tui-traces/`. Decode:

   ```bash
   node -e '
     const f=require("fs"),z=require("zlib"),p=process.argv[1];
     const o=JSON.parse(z.inflateSync(f.readFileSync(p)));
     o.tracePoints.forEach((x,i) => console.log(i, x.time||"", JSON.stringify(x.data||x).slice(0,200)));
   ' tui-traces/<your-trace-file>
   ```

   You see every raw PTY chunk with a timestamp. That tells you exactly what
   the program wrote and when.

2. **Clear the cache** between runs when you change harness or mock code —
   SWC caches aggressively:

   ```bash
   rm -rf cli/.tui-test/cache cli/tui-traces
   ```

3. **Inspect cell content inside the test** — log a specific row rather than
   a buffer hash:

   ```ts
   const rows = terminal.getViewableBuffer();
   const spinnerRow = rows.find(r => r.join('').includes('thinking'));
   console.log(JSON.stringify(spinnerRow?.join('')));
   ```

4. **Confirm the bug actually manifests** before trusting a green run. A
   quick sanity check: revert the fix, re-run — the test should go red. If
   it stays green, the test isn't observing what you think it is.

---

## Why not just compare byte streams?

Two reasons.

**Rewrites.** A live TUI constantly rewrites its live area: cursor-up +
clear-line + write. The raw bytes include "fix-up" sequences that don't end
up on screen. Asserting on bytes makes tests break whenever you change a
layout or colour. Asserting on the rendered cell grid makes them care only
about what the user sees.

**Ordering vs. state.** "Did the screen eventually show X?" is a
state question. A byte-level assertion answers "did the program emit a
particular escape sequence at a particular moment?", which is almost never
what you want to know.

If you ever do need raw bytes — e.g. to verify a specific escape sequence is
or isn't emitted — enable trace capture and read the per-chunk log. Don't
make that the test's primary assertion unless the escape sequence itself is
the thing under test.
