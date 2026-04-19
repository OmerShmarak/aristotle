import { defineConfig } from "@microsoft/tui-test";

export default defineConfig({
  testMatch: "tests/**/*.test.ts",
  timeout: 30_000,
  expect: { timeout: 12_000 },
  retries: 0,
  reporter: "list",
  // Set trace:true to capture zlib-compressed per-chunk PTY traces for
  // debugging animation / timing issues.
  trace: false,
});
