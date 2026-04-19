import { test, expect } from "@microsoft/tui-test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HARNESS = resolve(__dirname, "..", "bin", "aristotle-test-harness.js");
const SCRIPT = resolve(__dirname, "fixtures", "ctrl-c-interrupt.jsonl");

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
    ARISTOTLE_TEST_TOPIC: "ctrl c interrupt",
    FORCE_COLOR: "1",
  },
});

test("ctrl+c interrupts an active turn without immediately exiting the app", async ({ terminal }) => {
  await expect(
    terminal.getByText(/Working through the outline now\./g, { full: true })
  ).toBeVisible();

  await terminal.keyPress("c", { ctrl: true });

  await expect(
    terminal.getByText(/Interrupted current turn\./g, { full: true })
  ).toBeVisible();

  const screen = terminal.getViewableBuffer().map(r => r.join("")).join("\n");
  expect(screen).toContain("  > ");

  await terminal.keyPress("c", { ctrl: true });
});
