import { test, expect } from "@microsoft/tui-test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HARNESS = resolve(__dirname, "..", "bin", "aristotle-test-harness.js");
const SCRIPT = resolve(__dirname, "fixtures", "provider-switch.jsonl");

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
    ARISTOTLE_SKIP_INITIAL_SEND: "1",
    FORCE_COLOR: "1",
  },
});

test("slash commands switch between Codex and Claude", async ({ terminal }) => {
  await expect(
    terminal.getByText(/Type a message, @ to tag a file/g, { full: false })
  ).toBeVisible();

  terminal.write("/codex");
  await expect(
    terminal.getByText(/\/codex/g, { full: true })
  ).toBeVisible();
  terminal.write("\r");
  await expect(
    terminal.getByText(/Type a message, @ to tag a file · Codex/g, { full: false })
  ).toBeVisible();
  await expect(
    terminal.getByText(/Switched to Codex\./g, { full: true })
  ).toBeVisible();

  terminal.write("/claude");
  await expect(
    terminal.getByText(/\/claude/g, { full: true })
  ).toBeVisible();
  terminal.write("\r");
  await expect(
    terminal.getByText(/Type a message, @ to tag a file · Claude/g, { full: false })
  ).toBeVisible();
  await expect(
    terminal.getByText(/Switched to Claude\./g, { full: true })
  ).toBeVisible();
});
