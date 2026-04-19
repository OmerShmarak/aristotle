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
    ARISTOTLE_TEST_TOPIC: "approval prompt",
    FORCE_COLOR: "1",
  },
});

test("approval prompts are rendered with choices", async ({ terminal }) => {
  await expect(
    terminal.getByText(/Bash approval/g, { full: true })
  ).toBeVisible();
  await expect(
    terminal.getByText(/May I run a Bash command\?/g, { full: true })
  ).toBeVisible();
  await expect(
    terminal.getByText(/1\. Yes, proceed/g, { full: true })
  ).toBeVisible();
  await expect(
    terminal.getByText(/2\. No/g, { full: true })
  ).toBeVisible();
});
