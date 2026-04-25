import { test, expect } from "@microsoft/tui-test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HARNESS = resolve(__dirname, "..", "bin", "aristotle-test-harness.js");
const SCRIPT = resolve(__dirname, "fixtures", "chat-idle.jsonl");
const CWD = resolve(__dirname, "fixtures", "chat-tree");

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
    ARISTOTLE_TEST_FILES_ROOT: CWD,
    ARISTOTLE_SKIP_INITIAL_SEND: "1",
    FORCE_COLOR: "1",
  },
});

// First Ctrl+C while idle must clear a non-empty input buffer instead of
// exiting — the user has to press Ctrl+C a second time (within a short
// window) to quit. Matches Claude Code's behavior.
test("Ctrl+C clears a non-empty input buffer instead of exiting", async ({ terminal }) => {
  await expect(
    terminal.getByText(/Type a message, @ to tag a file/g, { full: false })
  ).toBeVisible();

  terminal.write("draft that I want to discard");
  await expect(
    terminal.getByText(/draft that I want to discard/g, { full: false })
  ).toBeVisible();

  terminal.keyPress("c", { ctrl: true });

  // The buffer should be gone from the input row.
  await new Promise(r => setTimeout(r, 400));
  const rows = terminal.getViewableBuffer().map(r => r.join(""));
  const draftRow = rows.find(r => /draft that I want to discard/.test(r));
  expect(draftRow).toBeUndefined();

  // The placeholder should be visible again.
  await expect(
    terminal.getByText(/Type a message, @ to tag a file/g, { full: false })
  ).toBeVisible();
});
