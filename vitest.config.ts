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
      // Honest whole-src floor, ratcheted up as real-code tests landed
      // (Phase 5: ~17% lines; db_queries ~70%). Raise these as coverage grows;
      // never lower them.
      thresholds: {
        statements: 15,
        branches: 9,
        functions: 18,
        lines: 16,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
