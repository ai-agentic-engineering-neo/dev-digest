// Flat config for @devdigest/web. Boundaries between folders are checked by
// `pnpm arch` (dependency-cruiser); this file covers what the import graph
// cannot see — hook correctness and the house rules in client/CLAUDE.md.
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import next from "@next/eslint-plugin-next";

export default tseslint.config(
  {
    // src/vendor/** is vendored — read it, do not edit it, so do not lint it.
    ignores: [".next/**", "node_modules/**", "src/vendor/**", "next-env.d.ts"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // App Router correctness only (`recommended`), not `core-web-vitals` — the
  // latter is a performance ruleset, which is a different conversation.
  next.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // Breaking either of these changes behaviour, not taste: a conditional
      // hook desyncs the hook order, and a component defined during render is
      // a new type every render, so React remounts it and its state resets.
      "react-hooks/rules-of-hooks": "error",
      // Warn, not error: a wrong dependency array is a bug worth flagging, but
      // not one worth blocking a build over while the tree is being cleaned up.
      "react-hooks/exhaustive-deps": "warn",

      // Allow the `_`-prefixed escape hatch the codebase already uses.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // client/CLAUDE.md: "`fetch` inside a component is banned. Go through a hook
    // in src/lib/hooks/*, which goes through lib/api.ts." lib/ is where that
    // chokepoint lives, so it is the one place allowed to call fetch.
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "fetch",
          message:
            "Call the API through a hook in src/lib/hooks/ (which goes through lib/api.ts), not fetch() in a component.",
        },
      ],
    },
  },
  {
    // Tests mock fetch and lean on loose shapes on purpose.
    files: ["**/*.test.{ts,tsx}", "src/test/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-restricted-globals": "off",
    },
  },
  {
    // Root config files are plain Node CJS/ESM, not app code.
    files: ["*.mjs", "*.cjs", "*.js"],
    languageOptions: { globals: { ...globals.node } },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
);
