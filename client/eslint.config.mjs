// ESLint flat config — Next.js rules + the layering rules from the
// frontend-ui-architecture skill (§5 one door to the network, §6 imports flow
// downward: app → components → lib → vendor).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const NO_RAW_API = {
  name: "@/lib/api",
  importNames: ["api"],
  message: "Components never call the API directly — add or extend a hook in src/lib/hooks/.",
};

const config = [
  { ignores: [".next/**", "node_modules/**", "src/vendor/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // `_name` = intentionally unused (destructured-away params, placeholders).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { paths: [NO_RAW_API] }],
    },
  },
  {
    files: ["src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [NO_RAW_API],
          patterns: [{ group: ["@/app/*"], message: "Shared components must not depend on routes (src/app)." }],
        },
      ],
    },
  },
  {
    files: ["src/lib/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/app/*", "@/components/*"], message: "lib/ is the bottom layer — it must not import routes or components." },
          ],
        },
      ],
    },
  },
];

export default config;
