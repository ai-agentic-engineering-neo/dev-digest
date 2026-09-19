// Flat config for @devdigest/api. Layer boundaries are checked by `pnpm arch`
// (dependency-cruiser); this file covers the house rules the import graph
// structurally cannot see — see the `onion-architecture` skill, "Enforcement".
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // src/vendor/** is the vendored contract copy — read it, do not edit it.
    ignores: ["dist/**", "node_modules/**", "src/vendor/**", "clones/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // server/CLAUDE.md: "Secrets only through `container.secrets`. Reading
    // `process.env` for a key is banned." The one place that reads the
    // environment is platform/config.ts, which turns it into typed AppConfig.
    // dependency-cruiser cannot see this — `process` is a global, not an import.
    files: ["src/**/*.ts"],
    ignores: [
      // The one file that turns the environment into typed AppConfig.
      "src/platform/config.ts",
      // The secrets chokepoint itself — it takes process.env as an injectable
      // default so tests can pass a fake environment.
      "src/adapters/secrets/local.ts",
      // WRITES (does not read) GIT_TERMINAL_PROMPT/GCM_INTERACTIVE so git
      // subprocesses inherit them; see the comment in the constructor.
      "src/adapters/git/simple-git.ts",
      // CLI entrypoints, not application code: they read DATABASE_URL directly.
      "src/db/migrate.ts",
      "src/db/seed.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: 'MemberExpression[object.name="process"][property.name="env"]',
          message:
            "Read configuration from platform/config.ts (AppConfig) and secrets from container.secrets — process.env is read in exactly one file.",
        },
      ],
    },
  },
  {
    // Tests build their own environment and stub adapters on purpose.
    files: ["test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-restricted-syntax": "off",
    },
  },
  {
    files: ["*.mjs", "*.cjs", "*.js", "drizzle.config.ts"],
    languageOptions: { globals: { ...globals.node } },
    rules: { "@typescript-eslint/no-require-imports": "off", "no-restricted-syntax": "off" },
  },
);
