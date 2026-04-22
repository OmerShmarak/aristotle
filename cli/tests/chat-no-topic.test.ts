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

// Launching with no topic arg should drop the user straight into a chat.
// The banner says "Chat mode", the "Topic:" line is absent, and the input
// placeholder is visible so the user knows they can type.
test("no-topic launch shows input placeholder and hides Topic label", async ({ terminal }) => {
  await expect(
    terminal.getByText(/Type a message, @ to tag a file/g, { full: false })
  ).toBeVisible();

  // The "Topic:" label must NOT appear (would come from the old one-shot
  // code path).
  await new Promise(r => setTimeout(r, 300));
  const rows = terminal.getViewableBuffer().map(r => r.join(""));
  const topicRow = rows.find(r => /^\s*Topic:/.test(r));
  expect(topicRow).toBeUndefined();
});
