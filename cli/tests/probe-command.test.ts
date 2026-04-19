import { test, expect } from "@microsoft/tui-test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HARNESS = resolve(__dirname, "..", "bin", "aristotle-test-harness.js");
const SCRIPT = resolve(__dirname, "fixtures", "approval-prompt.jsonl");

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
    ARISTOTLE_TEST_TOPIC: "probe command",
    ARISTOTLE_SKIP_INITIAL_SEND: "1",
    FORCE_COLOR: "1",
  },
});

test("slash probe command triggers the approval flow", async ({ terminal }) => {
  await terminal.submit("/probe-approval");

  await expect(
    terminal.getByText(/Running approval probe in an isolated Claude session\./g, { full: true })
  ).toBeVisible();
  await expect(
    terminal.getByText(/Bash approval/g, { full: true })
  ).toBeVisible();
});
