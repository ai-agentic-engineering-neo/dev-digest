// ESLint flat config for @devdigest/web.
//
// Base: Next.js core-web-vitals + TypeScript (includes react, react-hooks,
// jsx-a11y, import, @next/next). Project rules come from
// .claude/skills/frontend-architecture (§9 imports) and react-best-practices
// (keys, hooks). Architecture rules start as warnings and are fixed down
// before being promoted to errors (docs/improvement-plan.md, P0-1).
//
// `next build` does NOT run this (next.config.mjs → eslint.ignoreDuringBuilds);
// lint runs as its own step: `pnpm lint` locally and in .github/workflows/client.yml.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "tsconfig.tsbuildinfo",
      // Byte-identical copy of server/src/vendor/shared (scripts/check-contracts.sh).
      "src/vendor/shared/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Imports: alias instead of deep relative chains; UI only via the package entry.
      "no-restricted-imports": [
        "warn",
        {
          patterns: [
            {
              // 3+ "../" segments, except into messages/ (outside src/, so the @/ alias can't reach it).
              regex: "^(?:\\.\\./){3,}(?!\\.\\./)(?!messages/)",
              message: "Use the @/ alias instead of a ../../../ chain (frontend-architecture §9).",
            },
            {
              group: ["@devdigest/ui/*"],
              message: "Import UI only from '@devdigest/ui' (client/AGENTS.md).",
            },
          ],
        },
      ],
      "import/no-cycle": "warn",
      // Index keys break reconciliation on lists that reorder or filter.
      "react/no-array-index-key": "warn",
      // `_`-prefixed args/vars are intentionally unused.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // The design system's own files import each other relatively by design.
    files: ["src/vendor/ui/**"],
    rules: { "no-restricted-imports": "off" },
  },
];

export default config;
