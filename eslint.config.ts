import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

export default defineConfig([
  // Don't lint build output or generated dirs (this is a Node project, not browser).
  { ignores: ["dist/**", "coverage/**", ".code-graph/**"] },
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: { globals: globals.node },
  },
  tseslint.configs.recommended,
  {
    rules: {
      // Allow intentionally-unused names when prefixed with `_`.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // ESLint 10 added this to `js/recommended` (ADR-0009). We keep the
      // codebase's house style of defensive default initializers
      // (`let dbStatus = "skipped"`, `let fields = []`) that are then
      // reassigned in every branch — the defaults document intent and guard
      // against future branches, so this rule is intentionally disabled.
      "no-useless-assignment": "off",
    },
  },
  {
    // Test mocks/fixtures legitimately use `any` to stub Discord.js types.
    files: ["tests/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
]);
