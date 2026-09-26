---
name: frontend-ui-architecture
description: "Code organization and UI architecture for React + Next.js (App Router) frontends: where components, hooks, constants, utils/helpers, types, API calls and business logic live; how to split a component or a feature; which module may import which; where the 'use client' and server-only boundaries sit in the folder tree. Use when creating a new screen, feature or folder, when deciding where a file or function belongs, when a component or file has grown too big and must be split, when promoting code to shared, when reviewing a PR for structure, or when the user asks about project structure, folder layout, feature folders, colocation, FSD, bulletproof-react or 'where should this go' — even if they never say 'architecture'. Not for render performance, hook correctness or Next.js API details (react-best-practices, next-best-practices cover those)."
metadata:
  version: 1.0.0
---

# Frontend UI Architecture

One question drives this skill: **where does this code live, and who is allowed to
depend on it?** Everything below answers that. How a component behaves inside
(state, effects, memoization) and how a Next.js API is called are out of scope —
see "Scope" at the end.

## 0. Read the existing convention first

Consistency beats any layout in this file. The Next.js docs say it plainly:
choose a strategy "and be consistent across the project". Before recommending
anything:

1. Look at the tree (`src/`, `app/`, a few feature folders) and the path aliases
   in `tsconfig.json`.
2. Look for a written convention: `CLAUDE.md`, `docs/`, an architecture ADR,
   `eslint` boundary rules.
3. If a convention exists, **follow it** and flag only deviations from it. Propose
   a different structure only when asked, or when the current one demonstrably
   causes the problem at hand — and then as small moves, not a big-bang rewrite.

The rest of this file is the default for when no convention exists, and the
reasoning to fall back on when the convention is silent.

## 1. Principles

These six are what the sources agree on. Each rule later derives from one of them.

1. **Colocate.** Place code as close to where it is used as possible; things that
   change together live together. The default home of any new file is next to its
   only consumer. Why: the cost of a file is paid by whoever has to find and
   change it, and distance multiplies that cost.
2. **Promote on the second consumer, not before.** Code moves up to a shared
   location when a *second* feature needs it — not because it "might be reusable".
   Duplication is cheaper than the wrong abstraction, and a premature shared util
   accretes flags and conditionals until nobody can change it.
3. **Dependencies point one way:** `shared → features → app (routes)`. Shared never
   imports a feature; a feature never imports another feature; routes compose
   features. Why: one-way flow is what lets you delete or rewrite a feature
   without breaking unrelated screens.
4. **Routes are thin.** Files under `app/` handle routing concerns — params,
   metadata, layout, choosing which features to render. Logic lives below them.
5. **Group by domain first, technical type second.** A top level named `reviews/`,
   `pulls/`, `agents/` tells a reader what the app does; `components/`, `hooks/`,
   `utils/` at the top level only tell them it is React. Technical grouping is
   fine *inside* a feature.
6. **Every folder has a surface.** Outsiders import what a feature chooses to
   expose, not its internals, so the inside can be reorganized freely.

## 2. The three layers

| Layer | Typical path | Holds | May import |
|---|---|---|---|
| **app / routes** | `src/app/**` — `page`, `layout`, `loading`, `error`, `route` | params parsing, metadata, providers, composing features | features, shared |
| **features** | `src/features/<domain>/` *or* route-colocated `app/<route>/_components/` | one user-facing capability: its components, hooks, API calls, constants, helpers, types | shared only |
| **shared** | `src/components/`, `src/hooks/`, `src/lib/`, `src/utils/`, `src/config/`, `src/types/` | domain-agnostic building blocks | other shared, external packages |

A route-colocated `_components/` folder is simply a feature whose only consumer is
that route. It obeys the same rules; when a second route needs it, it moves to
`src/features/` or `src/components/`.

## 3. Where does X go?

Read the row, then pick the column by **how many places use it today**.

| Kind of code | One component | One feature / route | Two+ features |
|---|---|---|---|
| Component | inside the parent's folder | `<feature>/components/` or `_components/<Name>/` | `src/components/` (generic UI only) |
| Custom hook | in the component file, or `use<Name>.ts` beside it | `<feature>/hooks/` | `src/hooks/` |
| Pure domain helper (knows app types) | top of the file, outside the component | `<feature>/helpers.ts` (or `model/`) | the owning domain's module; never generic `utils/` |
| Pure generic util (no app types, no React) | top of the file | `<feature>/utils.ts` | `src/utils/<topic>.ts` |
| Constant | top of the file, above the component | `<feature>/constants.ts` | `src/config/` (runtime/env) or `src/constants/<domain>.ts` |
| Type | next to what it types | `<feature>/types.ts` | `src/types/`, or the contract module if the API defines it |
| API call (fetcher + schema) | — never in a component | `<feature>/api/` | `src/lib/api/` for the client instance only |
| Query keys / query options | — | `<feature>/api/queries.ts` | stays with the feature that owns the resource |
| Validation schema / API contract | — | `<feature>/api/` | a shared contract package when server and client both use it |
| Global state (store / context) | — never global | `<feature>/stores/` or a feature provider | `src/stores/` — only for true client state shared by distant routes |
| Configured third-party instance | — | — | `src/lib/` (`api.ts`, `query-client.ts`) |
| User-facing strings | i18n catalog, never constants | i18n namespace per feature | i18n shared namespace |
| Tests | beside the file (`X.test.tsx`) | beside the file | beside the file; e2e at the repo root |
| Styles | beside the component | beside the component | design tokens / theme in shared |

### Constants — the rules the table compresses

- A value used only in one file stays in that file, above the component.
  Promote it to a sibling `constants.ts` once there are several, or once a helper
  or test in the same folder needs it too.
- **Split shared constants by domain** (`constants/severity.ts`), never a single
  project-wide `constants.ts`. That file becomes a junk drawer every feature
  imports, which quietly couples all of them.
- **Runtime configuration is not a constant.** Anything derived from env
  variables lives in `src/config/`, is read and validated once, and is imported
  from there. On Next.js, server secrets are read only in server-only modules.
- A value that can be computed from other values is not a constant — compute it.
- Text shown to users belongs in the i18n catalog, not in a constants file.
- A value both server and client must agree on (status enums, route names in an
  API) belongs in the shared contract, so it cannot drift.
- Keep the `as const` object and the type derived from it in the same file.

### `lib` vs `utils` vs `helpers`

Names differ between projects; the distinction underneath is what matters:

- **`lib/`** — configured instances and thin wrappers around third-party
  libraries: the API client, the query client, a date library preset.
- **`utils/`** — pure, domain-agnostic functions. No React import, no app types.
  Grouped by topic (`utils/date.ts`, `utils/string.ts`), never one `utils.ts`.
- **`helpers.ts`** inside a feature — pure functions that *do* know the domain:
  mapping an API record to table rows, deciding a badge's severity.
- If it calls a hook, it is a hook (`use` prefix). If it calls no hooks, it is
  **not** a hook — name it `getX` / `formatX` so it can run anywhere, including
  conditions and tests without a renderer.

## 4. Where business logic lives

Inside a feature, logic settles into four tiers. Push each piece as low as it
can go — the lower it sits, the cheaper it is to test and reuse.

| Tier | Where | Contains | Depends on |
|---|---|---|---|
| 1. Domain logic | `helpers.ts`, `model/` | calculations, rules, validation, mapping — plain TS | nothing React |
| 2. Data access | `api/` | fetcher + schema + query keys/options, via the one API client | tier 1, `lib/api` |
| 3. Orchestration | `use<Purpose>.ts` hooks | combines data, local state and events into what one view needs | tiers 1–2 |
| 4. View | components | renders props and hook results; handlers call hook methods | tier 3 |

Consequences worth stating:

- **Most business logic belongs in tier 1.** If a rule can be expressed without
  React, write it without React; the hook then becomes a thin adapter.
- **Components never call `fetch` directly.** A single API client instance in
  `lib/` normalizes errors and auth; bypassing it means each call site re-invents
  both.
- **Server state lives in its cache** (TanStack Query, SWR, or RSC). Do not copy it
  into `useState` or a global store — that creates a second source of truth that
  goes stale.
- **Name hooks for their purpose** (`useFindingsFilter`), not for a lifecycle
  (`useMount`). A purpose-named hook constrains what callers can do with it.
- **Container/presentational is not a folder rule.** Its author withdrew it as a
  default: hooks give the same separation without an arbitrary split. Extract a
  purely presentational component when it is reused or needs to be tested or
  story-booked alone — not by reflex.
- On Next.js with a server layer, tier 2 has a server twin: a `server-only` Data
  Access Layer. See `references/nextjs-app-router.md`.

## 5. Splitting components

Split when any of these is true:

- **It has more than one job.** If its name needs "and", or its body switches
  between unrelated concerns, each concern becomes a component.
- **A region owns state its siblings do not use.** Extract that region *together
  with its state* — state moves down to the lowest component that needs it.
- **A region is repeated, or needs its own test.**
- **The file mixes levels of abstraction** — page layout next to low-level markup.
- **The data has a shape the UI does not.** UI and data models usually share an
  information architecture; one component per entity in the data is a good first cut.

Do **not** split:

- to hit a line count alone — size is a symptom to investigate, not a rule;
- into pieces that then need a dozen props threaded through (compose with
  `children` instead, or keep them together);
- "for future reuse" with one consumer today (principle 2).

A component starts as one file and grows into a folder the moment it needs a
second file:

```
FindingCard/
  FindingCard.tsx        # the component — the folder's public surface
  FindingCard.test.tsx
  helpers.ts             # tier 1, pure
  constants.ts
  styles.ts              # or FindingCard.module.css
  useFindingCard.ts      # only when orchestration is non-trivial
  SeverityLine.tsx       # a sub-component only FindingCard renders
```

Sub-components used only by their parent stay in the parent's folder. Shared
state between two siblings lifts to their closest common parent — no higher.

## 6. Import rules

- **Features do not import each other.** When feature A needs something from
  feature B: promote the shared piece to shared, or compose both at the route and
  pass one into the other as `children`/props.
- **Import through the surface.** If a feature has an entry file, outsiders use
  it; they do not reach into `features/x/components/internal/...`.
- **Barrels: narrow, explicit, feature-level only.** A feature `index.ts` with
  named exports is a useful public API. Avoid `export *` and project-wide barrels:
  they hide what is public, create import cycles, and on Next.js can pull server
  and client code into the same graph.
- **When promoting code, update every import site.** Do not leave a re-export
  shim at the old path; shims hide the dependency and can confuse bundlers.
- Sibling files import each other relatively; imports across layers use the
  project alias (`@/`).
- A module never imports its own folder's `index.ts` — that is a cycle.
- When the codebase is big enough that review cannot catch violations, enforce
  the direction with a linter (`eslint-plugin-boundaries` or
  `import/no-restricted-paths`); configs are in `references/layouts.md`.

## 7. Next.js App Router, in brief

Details and examples: `references/nextjs-app-router.md`.

- Next.js is unopinionated. Of its three documented strategies, default to
  **split by feature or route**: route-only code in `_components/` / `_lib/`
  private folders beside the route, cross-route code in `src/`.
- `_folder` opts a folder out of routing; `(group)` organizes routes and layouts
  without changing the URL. Use them instead of inventing conventions.
- `'use client'` is an **architectural** boundary: it marks the entry of a client
  subtree, and everything that file imports ships to the browser. Put it on the
  interactive leaf, and pass server-rendered parts into it as `children`.
- Providers get their own client file and wrap `{children}` as deep in the tree
  as they can.
- Server-only code (database, secrets, auth checks) lives in modules starting with
  `import 'server-only'`; they return minimal DTOs. Server Actions sit next to the
  feature in `actions.ts`, stay thin, and delegate to that layer.
- **If the app is a client-rendered studio talking to a separate backend**, the
  server-side patterns above mostly do not apply. Keep tiers 2–3 in the client
  (API client + query hooks), keep pages thin, and do not push an RSC migration
  unless it is asked for.

## 8. Structural review checklist

When reviewing a change for structure, check each; report the path and the rule.

- [ ] New files sit next to their only consumer, or the move up is justified by a second consumer.
- [ ] No feature imports another feature; no shared module imports a feature.
- [ ] Route files (`page`, `layout`) only compose; no business rules inside them.
- [ ] No `fetch` or API client call inside a component body.
- [ ] Domain rules are pure functions, not buried in hooks or JSX.
- [ ] Functions named `use*` call hooks; functions that call none are not named `use*`.
- [ ] Constants are scoped to their narrowest consumer; no new global junk-drawer file.
- [ ] Server state is not mirrored into `useState` or a global store.
- [ ] `'use client'` sits on the interactive subtree, not on a layout or a page wrapper by convenience.
- [ ] Server-only modules are marked `server-only` and never imported from client code.
- [ ] A promoted helper left no re-export shim behind.

## 9. How to answer

- **"Where should X go?"** — give the path, the rule from this file that decides
  it, and the event that would move it later ("moves to `src/utils/` when a second
  feature needs it").
- **"How should we structure this?"** — first report the existing convention
  (section 0). Then give a folder tree, a short "what goes where" table, and a
  migration as small, independently shippable moves.
- **Split / refactor requests** — name the responsibility each new piece owns and
  which tier (section 4) it lands in. `references/examples.md` has worked cases.

## Reference files

| File | Read when |
|---|---|
| `references/nextjs-app-router.md` | the project uses the App Router and the question touches `app/`, client/server placement, a Data Access Layer or Server Actions |
| `references/layouts.md` | proposing or migrating a whole structure; choosing between flat, feature-based and FSD layouts; setting up lint enforcement |
| `references/examples.md` | splitting a component, moving logic out of a component, or promoting code to shared |

## Scope

Covered elsewhere — defer to these skills instead of restating them:

- component purity, hooks rules, `useEffect`, memoization, keys, render
  performance → `react-best-practices`
- Next.js file conventions in detail, RSC validity rules, async APIs, data
  fetching patterns, metadata, images, fonts → `next-best-practices`
- auth and authorization inside a Data Access Layer → `security`
- schema design → `zod`; test placement and style → `react-testing-library`
