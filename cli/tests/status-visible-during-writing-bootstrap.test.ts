import { test, expect } from "@microsoft/tui-test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HARNESS = resolve(__dirname, "..", "bin", "aristotle-test-harness.js");
const SCRIPT = resolve(__dirname, "fixtures", "status-visible-during-writing-bootstrap.jsonl");

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
    ARISTOTLE_TEST_TOPIC: "writing bootstrap regression",
    FORCE_COLOR: "1",
  },
});

// Regression: after the assistant finishes the last planning text ("Writing
// now.") and then enters the silent bootstrap window before chapter totals
// arrive, the UI must still show activity. The final planning text should be
// committed to transcript and the status/spinner line should occupy the live
// area until the progress bar takes over.
test("status line is visible during the writing bootstrap gap", async ({ terminal }) => {
  await expect(
    terminal.getByText(/Writing now\./g, { full: true })
  ).toBeVisible();

  await expect(
    terminal.getByText(/Designing the breakdown\.\.\./g, { full: true })
  ).toBeVisible();

  const rows = terminal.getViewableBuffer();
  const screen = rows.map(r => r.join("")).join("\n");
  expect(screen).not.toContain("0/1 chapter written");
});
