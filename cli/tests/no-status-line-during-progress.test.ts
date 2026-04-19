import { test, expect } from "@microsoft/tui-test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HARNESS = resolve(__dirname, "..", "bin", "aristotle-test-harness.js");
const SCRIPT = resolve(__dirname, "fixtures", "no-status-line-during-progress.jsonl");

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
    ARISTOTLE_TEST_TOPIC: "progress exclusivity regression",
    FORCE_COLOR: "1",
  },
});

// Once chapter tracking is active, the live area should be owned by the
// progress bar alone. A separate status line such as "Designing the
// breakdown..." must not remain visible underneath or above it.
test("no separate status line renders while the chapter progress bar is visible", async ({ terminal }) => {
  await expect(
    terminal.getByText(/0\/1 chapter written/g, { full: true })
  ).toBeVisible();

  await new Promise(r => setTimeout(r, 500));

  const rows = terminal.getViewableBuffer();
  const screen = rows.map(r => r.join("")).join("\n");
  expect(screen).not.toContain("Designing the breakdown...");
});
