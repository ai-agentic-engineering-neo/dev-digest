# Enforcement — proposals (not in the repo yet)

**Status:** `client/` has no ESLint today. Until one of these lands, this skill and code review
are the only gate. Each item below needs a go-ahead before it is added; none should be added in
an unrelated PR. Source IDs resolve in `../README.md`.

Boundaries only hold if a tool checks them [S28, S81].

## 1. Import direction — `import/no-restricted-paths` (smallest step)

Matches the layer table in `structure.md`. It checks the resolved path, so `@/` aliases are
covered [S81]. Sketch (flat config):

```js
// client/eslint.config.mjs (proposal)
import importPlugin from "eslint-plugin-import";
export default [{
  files: ["src/**/*.{ts,tsx}"],
  plugins: { import: importPlugin },
  settings: { "import/resolver": { typescript: true } },
  rules: {
    "import/no-restricted-paths": ["error", { zones: [
      { target: "./src/lib", from: ["./src/components", "./src/app"] },
      { target: "./src/components", from: "./src/app" },
      { target: "./src/vendor", from: ["./src/lib", "./src/components", "./src/app"] },
    ]}],
    "import/no-cycle": "error",
  },
}];
```

Cross-route `_components` imports need per-route zones or `eslint-plugin-boundaries`
(`boundaries/dependencies` — the v7 rule; `element-types`/`entry-point` are deprecated) [S80].

## 2. Type-only imports of contracts

```js
"no-restricted-imports": ["error", { paths: [{
  name: "@devdigest/shared", allowTypeImports: true,
  message: "Runtime imports from @devdigest/shared break the Next build — import type only.",
}]}],
"@typescript-eslint/consistent-type-imports": "error",
```

Guards the INSIGHTS-recorded build break.

## 3. No fetch in components

```js
{ files: ["src/app/**/*.tsx", "src/components/**/*.tsx"],
  rules: { "no-restricted-imports": ["error", { paths: [
    { name: "@/lib/api", importNames: ["api", "apiFetch"], message: "Use a hook from lib/hooks." },
  ]}]}}
```

(`ApiError` stays importable for error branching.)

## 4. Naming — `eslint-plugin-check-file` [S84]

Encode the table in `conventions.md` (PascalCase component folders under `_components`,
kebab-case under `components/` and for modules). v3+ is flat-config only.

## 5. Dead code — Knip [S85]

`npx knip` in CI (or ad hoc) finds unused files and exports in `components/` and `lib/` — the
places that rot when code is promoted and its last consumer later disappears.

## 6. Graph rules in CI — dependency-cruiser [S83]

Optional, if per-route boundaries outgrow ESLint zones; mirrors `server/.dependency-cruiser.cjs`
planned by the `onion-architecture` skill, so both packages would use one tool.

## Bigger structural proposals (ADR first)

- `src/features/<domain>/` layer — see `structure.md`.
- Server-Component data fetching or SSR prefetch + `HydrationBoundary` — see `nextjs.md`.
- Migrating `lib/hooks/*` to `queryOptions` factories — mechanical, one domain file per PR.
