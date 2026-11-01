import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

// Mirrors the "@/*" alias in tsconfig.json and vite.config.ts, so the tests import the
// same modules the app does. The suite is deliberately environment-free (node, no DOM):
// everything the condition-aware engine does is a pure function over the record, which
// is exactly what makes it testable without rendering a screen.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
