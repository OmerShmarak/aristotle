# Aristotle CLI — Architecture

Interactive TUI that wraps Claude Code CLI to generate personalized textbooks.

## How it works

```
┌─────────────────────────────────────────────────────┐
│  bin/aristotle.js                                   │
│  Entry point: parse args, init engine, render Ink   │
└──────────────────────┬──────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
┌───────▼────────┐          ┌─────────▼─────────┐
│  lib/engine.js │          │   ui/App.js        │
│  Conversation  │◄────────►│   Ink TUI          │
│  loop          │ events   │   (React for term) │
└───────┬────────┘          └───────────────────┘
        │
┌───────▼────────┐
│  lib/claude.js │
│  Pure parser:  │
│  stream-json → │
│  normalized    │
│  events        │
└────────────────┘
```

## Layer responsibilities

### `lib/claude.js` — Parser (no features, no UI)
- Spawns `claude -p --output-format stream-json --include-partial-messages`
- Translates raw Claude Code events into normalized events
- Knows nothing about Aristotle, chapters, or UI
- Event types: `init`, `text`, `tool_start`, `task_started`, `task_completed`, `turn_end`, `result`, `retry`, `error`

### `lib/engine.js` — Conversation loop
- Manages session state (sessionId for `--resume`)
- Calls `claude -p` for each turn, resumes session for follow-ups
- Builds the system prompt from BREAKDOWN.md + CLAUDE.md + PROFILE.md
- Emits high-level events for the UI to consume
- Tracks phase: `planning` → `writing` → `idle`

### `lib/tracker.js` — Chapter progress (pure data)
- Consumes `task_started` / `task_completed` events
- Tracks spawned/completed counts
- No stdout writes — UI reads state via properties

### `ui/App.js` — Ink TUI
- React components rendered in the terminal via Ink
- `<Static>` for scrollback (completed messages)
- Live area: streaming text, spinner, progress bar, input
- Text smoother: buffers tokens and drips them at steady rate for smooth rendering
- Animations: spinner, pulsing text (nothing is ever static)

### `lib/theme.js` — Colors and ASCII art
- Warm earth tone palette
- Loads ASCII art from `aristotle.txt`

## Conversation flow

```
User runs: aristotle "quantum mechanics"

1. Engine sends: claude -p "I want to learn about: quantum mechanics"
   └─ Claude asks knowledge diagnosis questions
   └─ UI streams the response, shows input bar

2. User types answer, engine sends: claude -p "answer" --resume <sessionId>
   └─ Claude asks more questions or generates outline
   └─ UI streams response

3. User approves outline, engine sends: claude -p "approved" --resume <sessionId>
   └─ Claude spawns chapter agents
   └─ UI shows progress bar (task_started / task_completed events)

4. All chapters written → Claude compiles book
   └─ UI shows "done"
```

## Key constraint

We wrap `claude -p` (one-shot per call) rather than the Claude API directly.
This means users authenticate via their Claude subscription — no API keys needed.
Each conversation turn is a separate process, linked via `--resume <sessionId>`.

## Files

| File | Purpose |
|------|---------|
| `bin/aristotle.js` | Entry point |
| `bin/demo.js` | Demo mode with mock engine (for testing rendering) |
| `lib/claude.js` | Stream-json parser (translate raw → normalized events) |
| `lib/engine.js` | Conversation loop + session management |
| `lib/tracker.js` | Chapter progress tracking (pure data) |
| `lib/theme.js` | Colors, ASCII art loader |
| `ui/App.js` | Ink TUI components |
| `aristotle.txt` | ASCII art of Aristotle |
| `test-tracker.js` | Unit tests for parser + tracker |
