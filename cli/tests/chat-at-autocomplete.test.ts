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

// Typing `@` should open a popup listing files from the configured cwd.
// The fixture tree contains foo.md, sub/bar.md, sub/baz.md — all three
// should appear when the query is empty.
test("typing @ opens file autocomplete with cwd files", async ({ terminal }) => {
  // Wait for the input box to render before we start typing.
  await expect(
    terminal.getByText(/Type a message, @ to tag a file/g, { full: false })
  ).toBeVisible();

  terminal.write("@");

  await expect(terminal.getByText(/foo\.md/g, { full: false })).toBeVisible();
  await expect(terminal.getByText(/sub\/bar\.md/g, { full: false })).toBeVisible();
  await expect(terminal.getByText(/sub\/baz\.md/g, { full: false })).toBeVisible();
});

// Narrowing the query should filter matches.
test("autocomplete filters by query substring", async ({ terminal }) => {
  await expect(
    terminal.getByText(/Type a message, @ to tag a file/g, { full: false })
  ).toBeVisible();

  terminal.write("@baz");

  await expect(terminal.getByText(/sub\/baz\.md/g, { full: false })).toBeVisible();

  // Neither foo.md nor sub/bar.md should be listed under this query.
  await new Promise(r => setTimeout(r, 300));
  const rows = terminal.getViewableBuffer().map(r => r.join(""));
  // An autocomplete row for foo.md would render with a leading arrow/space
  // prefix followed by the path.
  const fooRow = rows.find(r => /[›\s]\s*foo\.md(\s|$)/.test(r));
  const barRow = rows.find(r => /[›\s]\s*sub\/bar\.md(\s|$)/.test(r));
  expect(fooRow).toBeUndefined();
  expect(barRow).toBeUndefined();
});
