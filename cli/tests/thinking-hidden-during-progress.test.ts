import { test, expect } from "@microsoft/tui-test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HARNESS = resolve(__dirname, "..", "bin", "aristotle-test-harness.js");
const SCRIPT = resolve(__dirname, "fixtures", "thinking-hidden-during-progress.jsonl");

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
    ARISTOTLE_TEST_TOPIC: "progress-bar regression",
    FORCE_COLOR: "1",
  },
});

// Regression: once chapter tracking is active (progress bar visible), the
// redundant "thinking" indicator that normally sits under the streaming text
// must be suppressed — the progress bar's own spinner carries the animation.
test("thinking indicator is hidden while chapter progress bar is visible", async ({ terminal }) => {
  // Wait for the progress bar to appear — this is the signal that chapter
  // tracking is active (chapters_total > 0).
  await expect(
    terminal.getByText(/0\/22 chapters written/g, { full: true })
  ).toBeVisible();

  // And streaming text is also on screen at this point.
  await expect(
    terminal.getByText(/Dispatching 22 chapter agents/g, { full: true })
  ).toBeVisible();

  // Now the actual assertion: the "thinking" indicator (a braille spinner
  // frame followed by the word "thinking") must NOT appear on screen. We
  // match the exact spinner+label combination so user-supplied topic text
  // that happens to contain "thinking" can't cause a false positive.
  // Give xterm a beat to drain any pending writes first.
  await new Promise(r => setTimeout(r, 500));

  const rows = terminal.getViewableBuffer();
  const screen = rows.map(r => r.join("")).join("\n");
  expect(screen).not.toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s+thinking/);
});
