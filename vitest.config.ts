import { defineConfig } from "vitest/config";

// Backend tests (convex/**) run in the edge runtime convex-test expects;
// the app's pure helpers (src/**) run there too since they need no DOM.
export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    include: ["convex/**/*.test.ts", "src/**/*.test.ts"],
  },
});
