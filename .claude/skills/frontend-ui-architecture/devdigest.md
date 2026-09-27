# This Repository

How the general rules map onto DevDigest's `client/` package. Read `client/AGENTS.md` for the authoritative conventions; this file only explains **which architectural rule each convention is an instance of**, and where the codebase currently diverges.

## The tier map

| General tier | Here | Notes |
|---|---|---|
| routes | `src/app/**/page.tsx` | thin; compose and delegate |
| route-local feature UI | `src/app/**/_components/<Name>/` | PascalCase folder, test beside it |
| cross-route, domain-aware | `src/components/<kebab-case>/` | `app-shell`, `diff-viewer`, `run-cost`, … |
| design system | `src/vendor/ui` → `@devdigest/ui` | import from the barrel, never a layer file |
| configured client + framework plumbing | `src/lib/` | `api.ts`, `hooks/`, `providers.tsx`, `theme.tsx` |
| wire contracts | `src/vendor/shared` → `@devdigest/shared` | **two copies** — the other is `server/src/vendor/shared` |

Promotion in this repo's terms has **two steps, and skipping the first is the common mistake**:

1. Shared by two modules **inside one route** → `helpers.ts` / `constants.ts` **at that route segment**. The repo already does this: `src/app/repos/[repoId]/pulls/helpers.ts` and `constants.ts` are shared by `page.tsx`, `PRRow` and `FilterBar`.
2. Rendered or used by **a second route** → `src/components/<kebab-case>/`.

A second consumer in the same route is step 1, not step 2. Promoting it to the cross-route tier makes a route-specific helper look reusable, and the next person has to prove it is not.

Note the naming split is deliberate and worth preserving: PascalCase for component folders under `_components/`, kebab-case for the cross-route tier. It makes the tier visible at the import site.

## Data access

`src/lib/api.ts` plus `src/lib/hooks/*` is the **only** path to server data — no `fetch` in components, no second HTTP client. That is the general "one configured client instance, features own their endpoints" rule, with the endpoint hooks grouped by area (`agents.ts`, `reviews.ts`, `repo-intel.ts`, `trace.ts`) rather than per feature folder.

The Data Access Layer material in [app-router.md](app-router.md) **does not apply to this package**. Data lives behind the Fastify API in `server/`; the client is an HTTP consumer, which is the first of the three sanctioned models. The DAL invariant — only one module touches the database client and secrets — is a `server/` concern.

There are no Server Actions here (`'use server'` appears nowhere) and no `server-only` imports. If either is introduced, the placement and re-authorization rules in [app-router.md](app-router.md) start applying.

## Contracts

`@devdigest/shared` exists as two physical copies, and `reviewer-core` type-checks against the server one. This is the shared-contract rule implemented by duplication rather than by a package, so it carries a duplication hazard the general rule does not: **a contract change must land in both copies**, and a type error on one side can mean drift rather than a genuine mismatch.

## Barrels

53 `index.ts` files, and they fit the sanctioned pattern rather than the anti-pattern:

- **Per-component one-line re-exports** — the compromise both sides of the barrel argument accept.
- **`@devdigest/ui` as a package-style public API** (13 lines) — the one case nobody disputes, and `client/AGENTS.md` already forbids importing a layer file behind it.

What to keep avoiding: a barrel over an unrelated collection, `export *`, and importing a module through its own `index.ts`. `src/lib/hooks/index.ts` is the one to watch — it is a grouping barrel, so keep it a pure re-export.

## Constants and helpers

Already correct, and worth not regressing: `constants.ts` and `helpers.ts` appear **only** beside the component that owns them — 27 of them, no root `utils.ts`, no global `constants.ts`. That is the colocation rule holding in practice.

When a helper starts being needed by a second component, the general rule applies: move the file, do not parameterize it in place.

## Where the codebase diverges from the general rules

Stated plainly rather than papered over:

**1. Five of seven `page.tsx` files are `"use client"`.** The general rule is to push the boundary to the leaves and keep route roots as Server Components. The root `layout.tsx` is correctly a Server Component, so the pattern is recoverable — but a client route root means everything that page imports is client code, and the `children`-as-slot pattern is unavailable inside it. Treat this as existing debt, not as the house style: new routes should start server-first and mark only the interactive leaves.

**2. No lint enforcement of any boundary.** There is no ESLint configuration in the repo; `client/` ships `typecheck` and `test` only. Every boundary in this skill is currently a convention held by review. If the rules are worth having, `import/no-restricted-paths` plus cycle detection is the cheap version — restrict `vendor/ui` and `vendor/shared` from importing `app/` or `components/`, and restrict `src/components/` from importing `src/app/`.

## Also applies here

- Every user-visible string goes to `messages/<locale>/*.json` via `next-intl`. This is a placement rule with the same shape as the others: the string belongs to the message catalog, not to the JSX.

  **The namespace is the feature area, not the route.** `prReview` serves both `/pulls` and `/pulls/[number]`; `shell` is cross-route chrome; `common` is genuinely shared. Adding a route to an existing area reuses that area's namespace rather than creating a file. (Several catalog files exist but are unused — they belong to features not yet built, the same way unused tables sit empty in the schema. An unused namespace file is not evidence of an abandoned convention.)

  **The catalog wins over `constants.ts` — but only for the text.** When a constant carries both structure and wording, split it: order, field keys and identifiers stay in `constants.ts` as `as const`; the label a user reads goes to the catalog and is looked up by key. A `COLUMNS` array holding English headers is the mistake this rule exists to prevent — and it is invisible until someone adds a second locale.
- Path aliases are `@/*`, `@devdigest/ui`, `@devdigest/shared`. Use relative imports inside a component folder and aliases across tiers — the general rule in [boundaries.md](boundaries.md).
- A component's test sits beside it as `<Name>.test.tsx`; DB-backed server tests are `*.it.test.ts`. Browser journeys live in `e2e/`, which is the sanctioned exception to colocation.
