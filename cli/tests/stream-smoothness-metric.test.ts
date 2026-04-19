import { test, expect } from "@microsoft/tui-test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HARNESS = resolve(__dirname, "..", "bin", "aristotle-test-harness.js");
const SCRIPT = resolve(__dirname, "fixtures", "stream-smoothness-metric.jsonl");

const NODE22 = "/opt/homebrew/opt/node@22/bin/node";
const LANDMARKS = [
  "Aristotle is",
  "streaming this",
  "sentence in",
  "small chunks",
  "so we can",
  "measure visible",
  "screen update",
  "cadence rather",
  "than raw PTY",
  "bytes alone.",
];

test.use({
  rows: 24,
  columns: 100,
  program: {
    file: NODE22,
    args: [HARNESS],
  },
  env: {
    ARISTOTLE_SCRIPT: SCRIPT,
    ARISTOTLE_TEST_TOPIC: "stream smoothness metric",
    FORCE_COLOR: "1",
  },
});

function getScreen(terminal: { getViewableBuffer: () => string[][] }) {
  return terminal.getViewableBuffer().map(r => r.join("")).join("\n");
}

// Metric test: measure visible-screen cadence rather than PTY chunk cadence.
// We sample the rendered grid every 50ms while a known sentence streams in,
// then derive:
// - time to first visible text (TTFV)
// - max gap between visible updates
// - number of landmark phrases that became visible over time
test("streaming text exposes measurable smoothness metrics", async ({ terminal }) => {
  await expect(
    terminal.getByText(/Aristotle is streaming this sentence/g, { full: true })
  ).toBeVisible();

  const sampleEveryMs = 50;
  const sampleDurationMs = 1400;
  const startedAt = Date.now();
  const seenAt = new Map<string, number>();

  while (Date.now() - startedAt < sampleDurationMs) {
    const screen = getScreen(terminal);
    const atMs = Date.now() - startedAt;
    for (const marker of LANDMARKS) {
      if (!seenAt.has(marker) && screen.includes(marker)) {
        seenAt.set(marker, atMs);
      }
    }
    await new Promise(r => setTimeout(r, sampleEveryMs));
  }

  expect(seenAt.size).toBeGreaterThanOrEqual(8);

  const firstVisibleAt = seenAt.get(LANDMARKS[0]);
  expect(firstVisibleAt).toBeTruthy();

  const observedTimes = LANDMARKS
    .map(marker => seenAt.get(marker))
    .filter((t): t is number => t !== undefined);

  let maxStallMs = 0;
  for (let i = 1; i < observedTimes.length; i++) {
    maxStallMs = Math.max(maxStallMs, observedTimes[i] - observedTimes[i - 1]);
  }

  expect(firstVisibleAt!).toBeLessThan(250);
  expect(maxStallMs).toBeLessThan(220);
});
