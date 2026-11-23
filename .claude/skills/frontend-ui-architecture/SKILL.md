---
name: frontend-ui-architecture
description: "Frontend UI architecture for React 19 + Next.js App Router: where code lives and how it is split. Use whenever the user asks where a component, constant, helper, util, hook, type, or piece of business logic should go; how to structure or restructure folders; whether/how to split or extract a component; how to organize `app/` routes and `_components`; where data fetching belongs; how features may import each other; or asks to review the structure of a diff or PR. Trigger even when the user does not say 'architecture' (e.g. 'this component is getting big', 'where do I put this constant', 'is this logic in the right place'). Architecture and code organization only — NOT performance, hooks rules, memoization or state-bug patterns (see react-best-practices) and NOT RSC runtime rules (see next-best-practices)."
metadata:
  version: 1.0.0
---

# Frontend UI Architecture (React + Next.js)

Answers one question: **"where does this code go, and how should it be cut up?"**
Version 1.0.0 · sources and changelog: [README.md](README.md) · source IDs like `[R1]` resolve there.

## Scope — and what to use instead

| Question | Use |
|---|---|
| Where does it live / how is it split / who may import whom | **this skill** |
| useEffect, memo, keys, derived state, anti-patterns | `react-best-practices` |
| RSC boundaries, async APIs, metadata, caching, bundling | `next-best-practices` |
| Writing tests | `react-testing-library` |
| Types / zod contracts | `typescript-expert`, `zod` |

Performance is deliberately out of scope. Do not add memo/lazy advice here.

## Why these rules exist

Structure is a bet on **what will change together**. Code that changes together should live together (colocation), code that changes for different reasons should be separated (decomposition), and every dependency should point one way so a change has a bounded blast radius. Each rule below is a corollary of that; when a rule does not fit, fall back to the principle.

## Step 1 — Place it: the decision flow

Ask in order; the first "yes" wins.

1. **Is it routing/composition only** (params, wiring, choosing views)? → `app/**/page.tsx` / `layout.tsx`. Keep it thin.
2. **Does it render UI?** → a component folder. Used by one parent → nested `_components/` of that parent. Used by several components of one route → that route's `_components/`. Used by several routes → `src/components/<name>/`.
3. **Does it call hooks / hold state / fetch?** → a custom hook `useX`. Server data → `src/lib/hooks/<domain>.ts`. UI-only state tied to one component → hook in that component's folder.
4. **Is it a pure function (no React, no I/O)?** → `helpers.ts` beside its only consumer. Second consumer in the *same feature* → feature-level `helpers.ts`. Second *feature* → `src/lib/`.
5. **Is it a fixed value** (thresholds, orders, key maps, option lists)? → `constants.ts` at the same scope rule as step 4. User-facing text is **not** a constant — it goes in `messages/<locale>/*.json`.
6. **Is it a type?** → API/contract types come from `@devdigest/shared`, never re-declared. Prop types stay in the component file; types shared inside a feature go in `types.ts`.
7. **Is it server-only** (secrets, DB, private API)? → its own module importing `server-only`.

"Used by" means *today*, not "might be". Promote on the second real consumer, not the imagined one. [R1][R6][R7]

## Core rules

1. **Colocate, then promote.** Put code next to its only consumer; move it up one level when a second consumer appears. Generic `utils/` folders outlive their callers and become dumping grounds. [R1][R6][R7][R11]
2. **Routes are thin.** `page.tsx` reads params, picks data hooks, composes views. Route-private UI lives in `_components/` (the underscore opts out of routing; it is a team convention, not a Next.js requirement). [N1]
3. **One folder per non-trivial component:** `Name/{Name.tsx, index.ts, constants.ts, helpers.ts, types.ts, styles.ts, Name.test.tsx, _components/}`. Create a file only when it has content — an empty `helpers.ts` is noise. [R3][R8][R5]
4. **Split by reason to change, not by line count.** Extract when a section has its own state, repeats, or changes for a different reason. A component should either implement details or compose other components, rarely both. Line count and prop count are *smells* that prompt the question, not triggers. [R12][R2][D1]
5. **Prefer composition over configuration.** Pass `children`/slots instead of boolean-flag props and prop drilling. Use compound components only for one cohesive widget (Tabs/Menu). [R12][R14]
6. **Container/presentational is optional now.** Hooks give the same separation without an extra component layer; split only when the presentational half is reused or tested in isolation. [R4][R13]
7. **Constants:** module-level if one consumer → `constants.ts` if shared in a feature → `src/lib/` if cross-feature. `UPPER_SNAKE` for true constants, `as const` for literal tuples/maps. No magic strings/numbers in JSX. [G1][R5]
8. **Helpers vs hooks vs utils.** Pure and React-free → helper (unit-test it directly). Calls a hook → `useX`. If it doesn't call a hook it must not be named `useX`. Hooks share logic, not state. `utils` at `src/lib` only for genuinely cross-feature, domain-free functions. [D3][D6][P1]
9. **Business logic stays out of JSX and event handlers.** Split it in two: *pure domain functions* (derive, validate, map DTO → view model) in `helpers.ts`, and *orchestration* (fetch, mutate, invalidate, navigate) in hooks. The component only binds data to markup. [M1][P1][P2]
10. **Data access has one door.** Components never call `fetch`; they use hooks from `src/lib/hooks/*` over `src/lib/api.ts`. Co-locate query keys with their hooks (a key factory per feature once keys are reused). [Q1][K1][K2]
11. **State lives at the lowest owner; server state is not client state.** URL (filters, pagination) → server cache (query lib) → local → context. Derive instead of storing. Details and bug patterns: `react-best-practices`. [D2][D4][D5][R9][K2]
12. **Imports point one way:** `app` → feature/route components → `src/components` → `src/lib` → `vendor`. No sibling-route imports; reach into a folder only through its `index.ts`; use the `@/` alias, not `../../../`. [R2][F1][R3][R5]
13. **Barrels: per-folder yes, giant roots no.** An `index.ts` that re-exports one component is the folder's public API. Wide re-export barrels hide dependencies, create cycles and slow tooling. [R2][R8][B1][N4]
14. **Grow structure only when it hurts.** flat → folder per component → feature folders → FSD-style layers. Do not pre-build layers for a small app. [R3][F1]

## Where sources disagree (decide, don't average)

- **By function vs by feature** — Comeau groups by technical role; Bulletproof/Kondov/Wieruch group by feature/route. *Default here: feature/route first, shared technical folders (`lib`, `components`) only for cross-feature code.* [R8][R2][R5][R3]
- **Barrels** — Bulletproof says avoid; Comeau/Wieruch use a per-component `index.ts`. *Default: per-component yes, root-level no* (rule 13).
- **Container/presentational** — Abramov stepped back from it as a rule in 2019. *Treat as an option, not a mandate.* [R4]

## Step 2 — Read next (only what the question needs)

| If the question is about… | Open |
|---|---|
| `app/` layout, `_private` folders, route groups, `server-only`, client/server split | [references/nextjs-app-structure.md](references/nextjs-app-structure.md) |
| Component folder anatomy, when/how to split, composition | [references/component-design.md](references/component-design.md) |
| Constants, helpers, hooks, business logic, data access, types | [references/logic-placement.md](references/logic-placement.md) |
| Imports, aliases, `index.ts`, barrels, dependency direction, lint enforcement | [references/imports-boundaries.md](references/imports-boundaries.md) |
| Working in **this repo** (real paths, known deviations, review checklist) | [references/devdigest-profile.md](references/devdigest-profile.md) |
| Before/after trees and code | [examples.md](examples.md) |

## Step 3 — Review checklist (use on a diff)

- [ ] Every new file sits at the narrowest scope that covers its real consumers.
- [ ] No new `utils`/`common` file created for a single caller.
- [ ] `page.tsx` composes; heavy logic moved to hooks/helpers/components.
- [ ] No `fetch`/API calls in components; data comes through `lib/hooks`.
- [ ] Pure logic is in a helper with a test; hook-calling logic is `useX`.
- [ ] No user-facing string literals outside `messages/`; no magic values in JSX.
- [ ] Contracts imported from `@devdigest/shared`, not re-declared.
- [ ] Imports use `@/` and go through `index.ts`; no sibling-route or upward-layer imports.
- [ ] A split was made for a reason to change, not just to shorten a file.
- [ ] No structure was added "for later" (empty folders, one-consumer abstractions).

## Gotchas

- Do not refactor to match this guide unasked. Existing deviations are listed in the DevDigest profile; fix them only inside the task's scope.
- When a repo convention conflicts with a source, the repo convention wins — consistency beats the textbook.
