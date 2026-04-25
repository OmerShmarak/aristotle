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

// Ctrl+W must delete the previous word, not a single character. The input
// line starts with "> "; after Ctrl+W it should show "hello " (trailing
// space from the readline-style word boundary) and no longer show "world".
test("Ctrl+W deletes the previous word", async ({ terminal }) => {
  await expect(
    terminal.getByText(/Type a message, @ to tag a file/g, { full: false })
  ).toBeVisible();

  terminal.write("hello world");
  await expect(terminal.getByText(/hello world/g, { full: false })).toBeVisible();

  terminal.keyPress("w", { ctrl: true });

  // "world" must be gone from the input row.
  await new Promise(r => setTimeout(r, 300));
  const rows = terminal.getViewableBuffer().map(r => r.join(""));
  const inputRow = rows.find(r => r.includes(">") && /hello/.test(r));
  expect(inputRow).toBeDefined();
  expect(inputRow!).not.toMatch(/world/);
  expect(inputRow!).toMatch(/hello/);
});
