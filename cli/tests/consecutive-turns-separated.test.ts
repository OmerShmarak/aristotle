import { test, expect } from "@microsoft/tui-test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HARNESS = resolve(__dirname, "..", "bin", "aristotle-test-harness.js");
const SCRIPT = resolve(__dirname, "fixtures", "consecutive-turns-separated.jsonl");

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
    ARISTOTLE_TEST_TOPIC: "turn separation regression",
    FORCE_COLOR: "1",
  },
});

// Two sequential assistant turns (no user message between them) must render
// on separate rows. Previously they concatenated onto the same row because
// the Text elements carried no trailing newline.
test("consecutive assistant turns are visually separated", async ({ terminal }) => {
  await expect(
    terminal.getByText(/First turn message finishes here\./g, { full: true })
  ).toBeVisible();
  await expect(
    terminal.getByText(/Second turn message starts here\./g, { full: true })
  ).toBeVisible();

  // Give xterm a beat to drain writes.
  await new Promise(r => setTimeout(r, 300));

  const rows = terminal.getViewableBuffer().map(r => r.join(""));
  const firstRow = rows.findIndex(r => r.includes("First turn message finishes here."));
  const secondRow = rows.findIndex(r => r.includes("Second turn message starts here."));

  expect(firstRow).toBeGreaterThanOrEqual(0);
  // A blank line between them means the row difference should be >= 2.
  expect(secondRow - firstRow).toBeGreaterThanOrEqual(2);
});
