import { defineConfig } from "vitest/config";

// Backend tests only (convex/**/*.test.ts), run in the edge runtime that
// convex-test expects. The app itself has no test runner yet.
export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    include: ["convex/**/*.test.ts"],
  },
});
