import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./tests/global-setup.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // The tests read one shared database; avoid concurrent writers.
    fileParallelism: false,
  },
});
