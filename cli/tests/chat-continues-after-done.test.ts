import { test, expect } from "@microsoft/tui-test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HARNESS = resolve(__dirname, "..", "bin", "aristotle-test-harness.js");
const SCRIPT = resolve(__dirname, "fixtures", "chat-done.jsonl");
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
    ARISTOTLE_TEST_TOPIC: "done flow",
    FORCE_COLOR: "1",
  },
});

// When the engine emits `done`, the old behavior was to exit the app after a
// 500ms delay. In chat mode the app must stay alive: the artifact message is
// rendered in the transcript, and the input box is still visible so the user
// can continue the conversation.
test("chat continues after the done event", async ({ terminal }) => {
  await expect(
    terminal.getByText(/Your breakdown is ready/g, { full: false })
  ).toBeVisible();
  await expect(
    terminal.getByText(/open \/tmp\/breakdown\.html/g, { full: false })
  ).toBeVisible();

  // Well past the old 500ms auto-exit window — input must still be there.
  await new Promise(r => setTimeout(r, 1500));
  await expect(
    terminal.getByText(/Type a message, @ to tag a file/g, { full: false })
  ).toBeVisible();
});
