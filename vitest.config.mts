import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // PGlite boots a full Postgres per test file; give it room on slower machines.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
