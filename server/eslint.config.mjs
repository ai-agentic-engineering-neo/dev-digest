// ESLint flat config — TypeScript-aware, no type-checked rules (fast, no tsc).
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  { ignores: ["node_modules/**", "dist/**", "clones/**", "test-results/**", "src/vendor/**", "src/db/migrations/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ["*.cjs"], languageOptions: { sourceType: "commonjs", globals: { ...globals.node } } },
  {
    files: ["**/*.{ts,mts,mjs}"],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-non-null-assertion": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  // Onion-architecture editor feedback. `pnpm lint:arch` (dependency-cruiser,
  // `.dependency-cruiser.cjs`) is the source of truth and gates CI; these
  // mirrors are warnings so legacy violations do not break `pnpm lint`.
  // Rings and fixes: `.claude/skills/onion-architecture-backend/`.
  {
    files: ["src/modules/**/routes.ts"],
    rules: {
      "no-restricted-imports": ["warn", {
        patterns: [
          { group: ["drizzle-orm", "drizzle-orm/*"], message: "onion: routes.ts is a driving adapter; call the module's service instead of Drizzle." },
          { group: ["**/db/*"], message: "onion: routes.ts never imports src/db; go through service → repository." },
          { group: ["./repository*", "./repository/*"], message: "onion: routes.ts talks to the service, not the repository." },
        ],
      }],
    },
  },
  {
    files: ["src/modules/**/*.ts"],
    ignores: ["src/modules/index.ts", "src/modules/**/routes.ts", "src/modules/**/repository.ts", "src/modules/**/repository/**", "src/modules/_shared/**"],
    rules: {
      "no-restricted-imports": ["warn", {
        patterns: [
          { group: ["drizzle-orm", "drizzle-orm/*"], message: "onion: Drizzle belongs in repository.ts (driven ring)." },
          { group: ["**/db/schema*", "**/db/rows*"], message: "onion: row types are persistence types; map to a DTO in the repository or helpers.ts." },
          { group: ["**/platform/container*"], message: "onion: take an explicit deps object by constructor; routes.ts builds it from app.container." },
          { group: ["fastify", "fastify-*", "@fastify/*"], message: "onion: the HTTP framework stops at routes.ts." },
        ],
      }],
    },
  },
  {
    files: ["src/adapters/**/*.ts"],
    rules: {
      "no-restricted-imports": ["warn", {
        patterns: [
          { group: ["**/modules/*", "**/modules/**"], message: "onion: an adapter implements a port; it never imports module code." },
          { group: ["**/platform/container*"], message: "onion: adapters are built by the container, never the reverse." },
        ],
      }],
    },
  },
  {
    files: ["src/modules/**/*.ts", "src/platform/**/*.ts"],
    ignores: ["src/platform/config.ts"],
    rules: {
      "no-restricted-syntax": ["error", {
        selector: "MemberExpression[object.name='process'][property.name='env']",
        message: "onion: feature code never reads process.env; config comes from AppConfig, keys from the SecretsProvider.",
      }],
    },
  },
);
