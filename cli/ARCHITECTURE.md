# Aristotle CLI — Architecture

Interactive TUI that wraps Claude Code and Codex CLI to generate personalized textbooks.

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
┌────────▼─────────┐
│ lib/providers/   │
│ claude.js        │
│ Codex.js         │
│ raw JSONL →      │
│ normalized events│
└──────────────────┘
```

## Layer responsibilities

### `lib/claude.js` and `lib/Codex.js` — Parsers (no features, no UI)
- Spawn `claude -p --output-format stream-json` or `codex exec --json`
- Translate provider-specific events into one normalized event surface
- Knows nothing about Aristotle, chapters, or UI
- Event types used by Aristotle: `init`, `text`, `tool_start`, `task_started`, `turn_end`, `result`, `retry`, `error`

### `lib/engine.js` — Conversation loop
- Manages a separate session ID for every provider
- Calls the active provider for each turn and resumes it for follow-ups
- Switches providers through `/codex` and `/claude` without crossing session IDs
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
- `ui/lib/input.js` owns answer normalization and slash-command parsing

### `lib/theme.js` — Colors and ASCII art
- Warm earth tone palette
- Loads ASCII art from `aristotle.txt`

## Conversation flow

```
User runs: aristotle "quantum mechanics"

1. Engine sends the topic through the active provider
   └─ The agent asks knowledge diagnosis questions
   └─ UI streams the response, shows input bar

2. User types an answer; the engine resumes that provider's session
   └─ The agent asks more questions or generates an outline
   └─ UI streams response

3. User approves the outline
   └─ The agent emits %%ARISTOTLE_CHAPTERS_TOTAL:N%% and spawns chapter agents
   └─ The agent emits %%ARISTOTLE_CHAPTER_DONE:<id>%% per finalized chapter
   └─ UI shows progress bar

4. All chapters written → the agent compiles the book
   └─ UI shows "done"
```

## Key constraint

We wrap `claude -p` and `codex exec --json` rather than calling model APIs.
Users authenticate through their CLI subscriptions. Each conversation turn is
a separate process linked through that provider's resume token.

## Files

| File | Purpose |
|------|---------|
| `bin/aristotle.js` | Entry point |
| `lib/claude.js` | Stream-json parser (translate raw → normalized events) |
| `lib/Codex.js` | Codex JSONL parser (translate raw → normalized events) |
| `lib/providers/` | Provider registry and adapters |
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
