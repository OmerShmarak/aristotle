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
- Event types used by Aristotle: `init`, `text`, `tool_start`, `task_started`, `turn_end`, `result`, `retry`, `error`

### `lib/engine.js` — Conversation loop
- Manages session state (sessionId for `--resume`)
- Calls `claude -p` for each turn, resumes session for follow-ups
- Delegates prompt construction, sentinel parsing, permission-question parsing, and event logging to helper modules under `lib/engine/`
- Emits high-level events for the UI to consume
- Tracks phase: `planning` → `writing` → `idle`
- Uses `task_started` only as an early hint that chapter work has begun; progress itself is sentinel-driven

Supporting engine modules:
- `lib/engine/system-prompt.js` — builds the appended system prompt
- `lib/engine/sentinel-stream.js` — incremental sentinel extraction from streamed text
- `lib/engine/permission-questions.js` — normalizes `AskUserQuestion` denials
- `lib/engine/event-log.js` — JSONL event mirroring
- `lib/engine/constants.js` — shared engine constants

### `lib/tracker.js` — Chapter progress (pure data)
- Sentinel-driven: `setTotal(n)` and `markDone(id)` API
- Engine parses `%%ARISTOTLE_CHAPTERS_TOTAL:N%%` and `%%ARISTOTLE_CHAPTER_DONE:<id>%%` from the outer model's text
- Decouples progress from sub-agent counts, so chapter agents can fan out freely
- No stdout writes — UI reads state via properties

### `ui/` — Ink TUI
- `ui/App.js` is the composition root
- `ui/hooks/useEngineState.js` projects engine events into UI state
- `ui/hooks/useStreamingText.js` owns live assistant text buffering
- `ui/components/*` contains presentational pieces such as transcript, banner, live panel, progress bar, spinner, and pulsing text
- `ui/lib/input.js` owns answer normalization and `/probe-approval` parsing

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
   └─ Claude emits %%ARISTOTLE_CHAPTERS_TOTAL:N%% and spawns chapter agents
   └─ Claude emits %%ARISTOTLE_CHAPTER_DONE:<id>%% per finalized chapter
   └─ UI shows progress bar

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
| `lib/claude.js` | Stream-json parser (translate raw → normalized events) |
| `lib/engine.js` | Conversation loop + session management |
| `lib/engine/` | Prompt/sentinel/question/logging helpers used by the engine |
| `lib/tracker.js` | Chapter progress tracking (pure data) |
| `lib/theme.js` | Colors, ASCII art loader |
| `ui/App.js` | Ink TUI composition root |
| `ui/hooks/` | UI state hooks |
| `ui/components/` | Ink presentational components |
| `ui/lib/` | UI-specific helpers |
| `aristotle.txt` | ASCII art of Aristotle |
| `test-tracker.js` | Unit tests for parser + tracker |
