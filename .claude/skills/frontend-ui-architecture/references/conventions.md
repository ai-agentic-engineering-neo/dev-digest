# Conventions — constants, helpers/utils/lib, types, naming, barrels, env

Source IDs resolve in `../README.md` → "Sources".

## Constants

Place a constant at the **lowest level that contains all its users** [S41, S55]:
file scope → `<Name>/constants.ts` → `app/<route>/constants.ts` → `lib/<topic>.ts`.

- Objects/functions that don't depend on props or state go **outside the component** (module
  scope), so they aren't recreated and aren't effect dependencies [S09].
- Module top-level runs at import time — no side effects or app initialization there [S07].
- `UPPER_SNAKE_CASE` for module-level constants and frozen maps (`MODEL_COLOR`,
  `SEVERITY_LEVELS`); `camelCase` for everything else [S26].
- Type maps against contracts: `Record<Severity, …>` so tsc catches a new enum member.
- Values mirrored from `@devdigest/shared` (enum options) live in a local `constants.ts` typed
  with the contract type — never imported as runtime values (client/INSIGHTS.md).
- No global `src/constants.ts` grab-bag: a cross-route constant sits next to the logic that
  uses it (`lib/format-cost.ts`, `lib/feature-models.ts`).

## helpers vs utils vs lib — the decision for this repo

Sources disagree on the words [S28 vs S35 vs S54]. DevDigest uses:

| Name | Meaning | Where |
|---|---|---|
| `helpers.ts` | Pure functions specific to one component or route (project/domain knowledge allowed) | `<Name>/helpers.ts`, `app/<route>/helpers.ts` |
| `lib/<topic>.ts` | Cross-route pure logic or a configured instance of a library: API client, query client, providers, formatters | `src/lib/` — **one file per topic**, never `lib/utils.ts` |
| `utils` | Not used as a folder or file name. A truly generic function (no DevDigest knowledge) is still named by topic in `lib/` (`lib/format-cost.ts`) | — |

Rules: name files by purpose, not by kind [S36]; no classes of static methods as namespaces
[S26]; every exported helper has a test next to it when it branches.

## Types

Matt Pocock's three rules [S68]:
1. Used in one file → declare it there.
2. Used by several files of a component/route → `types.ts` in that folder.
3. Used across packages → shared contract. Here that is `vendor/shared` (copied, not a package —
   a deliberate deviation; change both copies together, root CLAUDE.md).

Plus:
- API shapes come from `@devdigest/shared` via `import type`; don't redefine them. If a contract
  is missing, add a placeholder in `lib/types.ts` marked `// TODO: reconcile with @devdigest/shared`.
- Prefer types inferred from the Zod schema (`z.infer`) over hand-written duplicates.
- `.d.ts` only for ambient/global declarations, not app types [S69 secondary].
- Use `import type` for type-only imports [S26].

## Naming (matches the existing client)

| Thing | Case | Example |
|---|---|---|
| Component folder + file | PascalCase | `_components/FindingCard/FindingCard.tsx` |
| Shared component folder under `components/` | kebab-case, file inside PascalCase | `components/run-cost-badge/RunCostBadge.tsx` |
| Non-component module | kebab-case | `lib/format-cost.ts`, `lib/github-urls.ts` |
| Fixed per-folder files | lowercase | `index.ts`, `constants.ts`, `helpers.ts`, `styles.ts`, `types.ts` |
| Hook file | `useCamelCase.ts` | `hooks/useGlobalShortcuts.ts` |
| Test | `<file>.test.ts(x)` next to the file | `helpers.test.ts` |
| Route-private folder | `_name` | `_components` |

Sources pick different conventions (kebab everywhere S29, PascalCase components S54, snake_case
S26); the point is one convention, enforced [S54]. Default export is required only for
`page.tsx`/`layout.tsx`; everything else uses named exports (index.ts may add a default alias
for convenience, as existing folders do).

## Barrel files

- Allowed: one `index.ts` per component folder with explicit named re-exports — the folder's
  public entry (FSD "public API", without `export *`) [S37].
- Not allowed in new code: `export *`, barrels that aggregate many folders, importing a sibling
  inside the same folder through `./index` (cycles) [S45, S28].
- Legacy: `lib/hooks/index.ts` uses `export *`; leave it, but import new hooks from their domain
  file (`@/lib/hooks/reviews`).
- Comeau saw `export *` from an index break the App Router build (duplicate `default`) — another
  reason for explicit names [S54].

## Imports

- `@/…` for anything outside the current component folder; `./` inside it.
- `@devdigest/ui` for primitives, `@devdigest/shared` for contract **types**.
- No `../../../../` chains in new code.

## Environment variables

- Read env in **one module** — today `lib/api.ts` (`NEXT_PUBLIC_API_BASE`). If more variables
  appear, create `lib/env.ts` that validates with Zod and fails fast, and import from it [S32, S86].
- `NEXT_PUBLIC_*` values are inlined at build time; `process.env[name]` dynamic access is not
  inlined; `.env*` files stay in `client/` root [S19].
- Never put secrets in client env — secrets live in `~/.devdigest/secrets.json` behind the API.
