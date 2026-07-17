import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      all: true,
      include: ["src/**"],
      exclude: [
        "node_modules/**",
        "dist/**",
        "tests/**",
        "**/*.config.ts",
        "src/scripts/**",
      ],
      // Honest whole-src floor. Currently ~3.6% — most of src is untested
      // (see docs/audit TEST-1). Ratchet these UP as coverage is added in
      // later audit phases; never lower them.
      thresholds: {
        statements: 3,
        branches: 1,
        functions: 3,
        lines: 3,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
