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
        // Composition root / entrypoint: constructs the Discord Client, wires
        // gateway + process signal handlers, and calls client.login() at import.
        // Not unit-testable without a live gateway — excluded like src/scripts/**.
        "src/core/bot.ts",
      ],
      // Whole-src floor, ratcheted up as real-code tests landed. Commands,
      // features/lfg, and utils are now driven end-to-end via mocked Discord
      // interactions against a real temp DB (tests/fixtures/mock-interactions.ts),
      // clearing the project's 80% quality gate on every metric. Actuals at the
      // time of writing: ~93% stmts / 80% branches / 93% funcs / 94% lines.
      // Raise these as coverage grows; never lower them.
      thresholds: {
        statements: 88,
        branches: 78,
        functions: 88,
        lines: 90,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
