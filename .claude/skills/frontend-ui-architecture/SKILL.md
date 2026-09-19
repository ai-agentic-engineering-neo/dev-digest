---
name: frontend-ui-architecture
description: Use when deciding where frontend code lives or how to split it in a React / Next.js app — placing a new component, hook, constant, helper, util, type, API call or business rule; breaking up a large component; creating or cleaning up utils/, lib/, hooks/, constants/ or index.ts barrels; choosing shared vs feature-local; drawing the 'use client' boundary. Architecture and code organization only, not performance.
metadata:
  version: "1.0.0"
  updated: "2026-09-19"
---

# Frontend UI Architecture

## Overview

Placement follows ownership: code lives next to its only consumer, and moves to shared code only when a second consumer appears. Every non-JSX piece has a kind (domain rule, UI mapping, generic util, adapter, data access, hook). The kind decides where it goes, not the file it happened to be written in.

**Project conventions win.** If the repo's `CLAUDE.md` names folder or file shapes (for example `_components/<Name>/` with `helpers.ts`, `constants.ts`, `styles.ts`), use those names. This skill decides *which* of those slots a piece of code goes into, and when it moves up.

Out of scope, see the sibling skills instead: hooks misuse and render performance (`react-best-practices`), Next.js file conventions, RSC serialization and data-fetching APIs (`next-best-practices`), Zod API (`zod`).

## Step 1 — classify every piece

| Kind | Test | Home |
|---|---|---|
| **Domain rule** | Encodes a product decision ("stale after 7 days", run cost = tokens × price, bots sort last). Changes when the business changes. | Plain TS module, **no React import**, named after the entity: `<feature>/model.ts` or `lib/<entity>/`. Its constants go in the same file. |
| **UI mapping** | Maps domain values to presentation (severity → color, status → icon/label). | Next to the UI that uses it. Shared UI mappings go in the UI layer (the project's design-system folder, otherwise `components/ui/`), not `lib/<entity>/`. |
| **Input parser** | Validates untrusted non-API input: search params, form values, localStorage. | A pure function, schema-based where possible, placed by consumer count (Step 2). It must not import React, because Server Components and client hooks may both call it. |
| **Generic util** | Knows nothing about the domain (`formatRelativeTime`, `clamp`, `groupBy`). Would work in any app. | Local `helpers.ts` while it has one consumer. Once shared, a themed module (`lib/format.ts`, `lib/date.ts`). **Never** a catch-all `utils.ts`. |
| **Adapter** | Wraps a third-party library (mermaid, a chart library, analytics). | Next to its consumer. Once shared, `lib/<library>.ts` (the anti-corruption layer). |
| **Data access** | Fetch function, query key, query/mutation hook, DTO→domain parse. | Per resource (an entity plus its sub-collections, e.g. agent + its runs): fetchers, key factory, `queryOptions`, query **and mutation** hooks in **one module** (`lib/api/<resource>.ts` or `<feature>/api.ts`). Export the key factory so other modules can invalidate by key; don't copy the keys. Parse with the schema at this boundary. |
| **Wire type** | Shape the API returns. | `z.infer` of the contract schema. **Never hand-write it**, and never put it in a `types/` dump. |
| **Hook** | Calls other hooks (state, effect, query, context). | Next to its component. If it calls no hooks, it is a plain function: drop the `use` prefix and put it in helpers or the model. |
| **Constant** | Named literal. | In the file or `constants.ts` of its only consumer. A **business threshold** (changes what is true: stale-after-days, price per token) goes with its domain rule. A **display limit** (changes only what is shown: max rows, truncate length) goes with the UI. Env-derived values go in a single parsed `env`/`config` module, not in constants. |
| **Component** | Returns JSX. | Route- or feature-local folder. It moves to shared `components/` only when a second feature renders it. |

## Step 2 — place by consumers (the promotion rule)

Place code at the **nearest common ancestor folder of all its consumers**:

- **1 consumer:** colocate it in the same file, or a sibling `helpers.ts`/`constants.ts`/`model.ts`.
- **2+ consumers under one feature or route subtree** (e.g. `pulls/page.tsx` and `pulls/[number]/page.tsx`): put it at that subtree's root (`pulls/_lib/model.ts`), still not global.
- **Consumers in unrelated features or subtrees:** the only common ancestor is the app root, so it moves to the shared layer (`lib/`, `components/`), named by theme or entity.
- **Demotion:** when a shared item is down to one consumer, move it back.

Dependency direction is one-way: **shared (`lib`, `components`, `ui`) → features → app/routes**. Shared never imports a feature, and one feature never imports another's internals; compose them in the page. If you need a sideways import, the code is really shared, so promote it.

## Step 3 — split components by responsibility, not by line count

- Split when you can't describe the component in one sentence without "and", or when one part has state the rest doesn't need.
- Pull logic out before markup. Non-view logic goes to a hook (if it needs React) or the model (if it doesn't); the component keeps only JSX and wiring. Hooks replace container/presentational wrappers.
- Many boolean or variant props mean composition: `children`, slots, or compound components.
- Don't split two similar-but-different snippets into a shared abstraction until a third real use case appears.
- One exported component per file. Tightly coupled sub-components stay inside the parent's folder.

## Next.js App Router

The server/client boundary is an architecture decision: `'use client'` goes on interactive leaves, and `server-only` fences modules that hold secrets. Routes stay thin. For details, the external-API data layer, and route-level colocation, see [nextjs.md](nextjs.md).

## Barrels (`index.ts`)

- **OK:** a thin `index.ts` that re-exports one component folder's public entry (or is required by project convention).
- **Not OK:** hub barrels re-exporting many modules (`utils/index.ts`, `components/index.ts`), or barrels of barrels. They hide the dependency graph and cause cycles, and in Next.js they inflate dev-server module counts.
- When cleaning up a hub barrel, move each export to its owner using Steps 1–2, update the imports, then delete the barrel. Don't recreate it under a new name.

## Red flags

| You're about to… | Instead |
|---|---|
| put a business rule or price table in a component's `helpers.ts` "since only it uses it" | Put it in a domain module (`model.ts`). The UI consumes it. |
| put a UI mapping (enum → color) in `lib/<entity>/` next to domain rules | Put it with the UI/design layer. |
| create `utils.ts`, `helpers/index.ts`, `common/` | Use a themed module (`format.ts`, `date.ts`), or keep it local. |
| hand-write `type Pr = {…}` for API data | Use `z.infer<typeof PrSchema>` from the contract. |
| put a single-consumer hook in global `hooks/` "because that's where hooks go" | Colocate it. The folder name isn't a reason. |
| mark a whole page or layout `'use client'` for one button | Extract the interactive leaf. |
| import from `features/a/...` inside `features/b/...` | Promote the shared piece, or compose both in the route. |
| name a pure function `useSomething` | Drop the prefix. |
