# BREAKDOWN.md protocol evals

BREAKDOWN.md is the product, and until now it had no safety net: a prompt
edit could silently break protocol adherence (sentinels, the no-teaching
rule, parallel spawning) and you'd only find out mid-run. This directory is
that safety net.

Two layers, by cost:

## 1. The checker — free, runs on any transcript

`check-protocol.js` takes a `claude.jsonl` transcript (the eval runner's
output, or any `~/.aristotle/sessions/<id>/claude.jsonl`) and asserts the
protocol:

| rule | what it catches |
|---|---|
| `diagnosis-teaching-prose` | lecturing during diagnosis (teaching tells, or >800 words; >350 warns) |
| `outline-missing` / `outline-no-approval-ask` | no numbered chapter list, or final outline doesn't ask "Approved?" |
| `agents-before-approval` | chapter agents spawned before the approval gate |
| `premature-sentinel` | TOTAL/CHAPTER_DONE/DONE emitted during diagnosis/outline |
| `total-missing` / `total-after-agents` | CHAPTERS_TOTAL absent, or emitted after agents already spawned |
| `serial-spawning` | chapter agents spread across messages instead of all in one (the ~2min-vs-~12min bug) |
| `chapter-done-mismatch` / `chapter-done-duplicate` | finalized-chapter count ≠ total, or double-emits |
| `build-script-missing` | build-book.sh never invoked |
| `done-missing` / `done-not-last` | DONE sentinel absent or not the last line |
| `sentinel-not-own-line` | sentinel sharing a line with prose |
| `slug-invalid` (+ missing/duplicate warnings) | malformed %%ARISTOTLE_SLUG%% |

```bash
npm run eval:check -- ~/.aristotle/sessions/<id>/claude.jsonl              # full pipeline expected
npm run eval:check -- <transcript> --through outline                       # outline-only transcript
```

Heuristic notes: turn classification is blunt by design (a diagnosis turn
with 3+ numbered multiple-choice options classifies as "outline" and skips
the lecture check). The per-run summary at the top of the report shows the
classification — eyeball it when a result surprises you. Structural
execution checks apply to the **first** execution turn; later chat-mode
rebuild turns may legitimately re-emit DONE without a fresh TOTAL.

The checker itself is tested against synthetic transcripts in `fixtures/`:

```bash
npm run eval:test    # free, instant — part of every test pass
```

## 2. The runner — spends real subscription usage

`run-evals.js` replays scripted student scenarios (`scenarios/*.json`)
through real `claude -p`, using the exact system prompt the engine builds
(BREAKDOWN.md + PROFILE.md + operating-environment briefing), then checks
the transcript. Output lands in `runs/<stamp>-<scenario>/` (gitignored):
`claude.jsonl`, `report.json`, and the `artifact/` dir the model wrote into.

```bash
npm run eval                                  # all scenarios, outline mode (cheap: 2 short turns each)
npm run eval -- eager-student                 # one scenario
npm run eval -- basic-technical --through done  # FULL build: spawns chapter agents, writes a real book
```

- `--through outline` (default): topic + scripted replies, stops before
  approval. Checks diagnosis/outline behaviour and that nothing spawns
  early. A few short turns per scenario.
- `--through done`: also sends the approval reply and waits for the whole
  build. One agent per chapter — treat it like generating a real book.
  Run a single scenario, after prompt changes you don't trust.

When to run: after any edit to BREAKDOWN.md or the engine's system-prompt
briefing (`cli/lib/engine/system-prompt.js`). The TUI test suite does not
cover prompt behaviour — this is the only thing that does.

Scenario format (`scenarios/<name>.json`):

```json
{
  "name": "eager-student",
  "description": "what this scenario stresses",
  "topic": "first message (the aristotle CLI argument)",
  "replies": ["sent in order after the topic — craft them so the outline has arrived by the last one"],
  "approval": "sent only with --through done"
}
```

Replies are fixed regardless of what the model asks, so write them to
preempt: state the full background and explicitly ask for the outline.
