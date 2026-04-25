import { test, expect, Key } from "@microsoft/tui-test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HARNESS = resolve(__dirname, "..", "bin", "aristotle-test-harness.js");
const SCRIPT = resolve(__dirname, "fixtures", "resume-idle.jsonl");
const SESSIONS = resolve(__dirname, "fixtures", "resume-sessions.json");

const NODE22 = "/opt/homebrew/opt/node@22/bin/node";

test.describe("resume picker", () => {
  test.use({
    rows: 30,
    columns: 120,
    program: { file: NODE22, args: [HARNESS] },
    env: {
      ARISTOTLE_SCRIPT: SCRIPT,
      ARISTOTLE_SKIP_INITIAL_SEND: "1",
      ARISTOTLE_TEST_SHOW_PICKER: "1",
      ARISTOTLE_TEST_SESSIONS_FILE: SESSIONS,
      FORCE_COLOR: "1",
    },
  });

  test("opens at startup with -r and lists past sessions", async ({ terminal }) => {
    await expect(
      terminal.getByText(/Resume a session/g, { full: false })
    ).toBeVisible();
    await expect(
      terminal.getByText(/quantum mechanics/g, { full: false })
    ).toBeVisible();
    await expect(
      terminal.getByText(/music theory/g, { full: false })
    ).toBeVisible();
  });

  test("Enter on highlighted entry restores its messages", async ({ terminal }) => {
    await expect(
      terminal.getByText(/quantum mechanics/g, { full: false })
    ).toBeVisible();
    // Default cursor is on the first row → quantum mechanics.
    terminal.keyPress(Key.Enter);
    await expect(
      terminal.getByText(/RESUMED-QUANTUM-CHAPTER/g, { full: false })
    ).toBeVisible();
  });

  test("arrow-down then Enter selects the second entry", async ({ terminal }) => {
    await expect(
      terminal.getByText(/music theory/g, { full: false })
    ).toBeVisible();
    terminal.write("\x1b[B"); // arrow down (no Key enum entry for arrows)
    terminal.keyPress(Key.Enter);
    await expect(
      terminal.getByText(/RESUMED-MUSIC-CHAPTER/g, { full: false })
    ).toBeVisible();
  });
});

test.describe("ctrl-r in chat", () => {
  test.use({
    rows: 30,
    columns: 120,
    program: { file: NODE22, args: [HARNESS] },
    env: {
      ARISTOTLE_SCRIPT: SCRIPT,
      ARISTOTLE_SKIP_INITIAL_SEND: "1",
      ARISTOTLE_TEST_SESSIONS_FILE: SESSIONS,
      FORCE_COLOR: "1",
    },
  });

  test("Ctrl+R in idle chat opens the picker", async ({ terminal }) => {
    // Wait for the input prompt to appear (idle phase reached).
    await expect(
      terminal.getByText(/Type a message/g, { full: false })
    ).toBeVisible();
    terminal.keyPress("r", { ctrl: true });
    await expect(
      terminal.getByText(/Resume a session/g, { full: false })
    ).toBeVisible();
    terminal.keyPress(Key.Enter);
    await expect(
      terminal.getByText(/RESUMED-QUANTUM-CHAPTER/g, { full: false })
    ).toBeVisible();
  });
});
