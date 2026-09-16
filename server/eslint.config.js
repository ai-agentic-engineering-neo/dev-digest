import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**", "src/vendor/**", "src/db/migrations/**", "clones/**"],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Convention: a leading underscore marks an intentionally-unused param/var.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
);
