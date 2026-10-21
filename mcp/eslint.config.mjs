// ESLint flat config — TypeScript-aware, no type-checked rules (fast, no tsc).
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  { ignores: ["node_modules/**", "dist/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,mts,mjs}"],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-non-null-assertion": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      // stdout is the MCP protocol channel: only stderr logging is allowed.
      "no-console": ["error", { allow: ["error", "warn"] }],
      "@typescript-eslint/consistent-type-imports": "error",
      // @devdigest/shared is type-only here so no second zod copy loads at runtime.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@devdigest/shared",
              message: "Import @devdigest/shared with `import type` only.",
              allowTypeImports: true,
            },
          ],
          patterns: [
            {
              group: ["@devdigest/shared/*"],
              message: "Import @devdigest/shared with `import type` only.",
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
);
