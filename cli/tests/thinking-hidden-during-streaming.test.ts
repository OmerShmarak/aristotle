import { test, expect } from "@microsoft/tui-test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HARNESS = resolve(__dirname, "..", "bin", "aristotle-test-harness.js");
const SCRIPT = resolve(__dirname, "fixtures", "thinking-hidden-during-streaming.jsonl");

const NODE22 = "/opt/homebrew/opt/node@22/bin/node";

test.use({
  rows: 24,
  columns: 100,
  program: {
    file: NODE22,
    args: [HARNESS],
  },
  env: {
    ARISTOTLE_SCRIPT: SCRIPT,
    ARISTOTLE_TEST_TOPIC: "streaming thinking regression",
    FORCE_COLOR: "1",
  },
});

// While text is streaming in the planning phase (before chapter tracking
// kicks in), the "thinking" indicator that used to sit under the streamed
// text must NOT appear. The streaming text itself signals activity; the
// redundant pulsing indicator was visually noisy during long text blocks
// (e.g. the chapter plan).
test("thinking indicator is hidden while text is streaming in planning phase", async ({ terminal }) => {
  // Wait until streamed text is on screen.
  await expect(
    terminal.getByText(/Here is the plan for the single chapter/g, { full: true })
  ).toBeVisible();

  // Give xterm a beat to drain any pending writes and for any spinner
  // animation to have cycled at least once (spinner ticks every 80ms).
  await new Promise(r => setTimeout(r, 500));

  // The "thinking" indicator is a braille spinner frame immediately
  // followed by the word "thinking" (with optional separating space). It
  // must not appear anywhere on screen while text is streaming.
  const rows = terminal.getViewableBuffer();
  const screen = rows.map(r => r.join("")).join("\n");
  expect(screen).not.toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s+thinking/i);
});
