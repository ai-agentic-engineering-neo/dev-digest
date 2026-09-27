---
name: frontend-ui-architecture
description: "Use when deciding where frontend code belongs or how to split it — a new component, hook, util, constant or type and no obvious folder; a file that has grown too big; one feature needing to import another; adding a route, Server Action or data-access module in Next.js App Router; a utils/, constants.ts or barrel index.ts turning into a junk drawer; reviewing a PR for structure rather than correctness. React + Next.js, architecture and code organization only."
version: 1.0.0
---

# Frontend UI Architecture

Where frontend code belongs, and what is allowed to import what.

## Scope — read this first

This skill answers **placement and dependency** questions. Three neighbouring skills answer different ones; do not restate their content here.

| Question | Skill |
|---|---|
| Where does this file go? May A import B? How is this module split? | **this skill** |
| Is this component correct? (derived state, hook rules, keys, memo) | `react-best-practices` |
| How does this Next.js API behave? (serialization, caching, metadata, images) | `next-best-practices` |
| What should this look like? | `frontend-design` |

"Is this code right?" is not this skill. "Where does this code live?" is.

## The two rules everything else derives from

**1. Colocate by default.** Put code as close to its only consumer as possible. Distance from the consumer must be *earned* by a second consumer, never assumed up front.

**2. Dependencies point one way.** `routes → features → shared`. A layer never imports upward; siblings on a layer never import each other. An import that violates this is not a style problem — it is the boundary ceasing to exist.

Everything below is these two rules applied to a specific kind of file.

## This repository — `client/`

The generic default is below; this is where it lands in DevDigest. Details and the
known deviations: [devdigest.md](devdigest.md).

| What | Where | Rule |
|---|---|---|
| Pages (App Router) | `client/src/app/**/page.tsx` | thin: compose `_components`, hold no feature logic; a layout (`layout.tsx`) when a pane must survive navigation, as `/skills` does |
| Components of one page | `client/src/app/<route>/_components/<Name>/` | only that route subtree imports them; nest under the single parent that renders them |
| Shared components | `client/src/components/<kebab-case>/` | earned by a SECOND route rendering it; domain-free primitives live in `src/vendor/ui` (`@devdigest/ui`) |
| Helpers two siblings share | `client/src/app/<route>/helpers.ts` / `constants.ts` | the nearest common route segment, not `src/components/` |
| Server data | `client/src/lib/hooks/<area>.ts` → `src/lib/api.ts` | no `fetch` in a component |
| Copy | `client/messages/<locale>/<namespace>.json` | no hardcoded strings in JSX |

**Naming.** A component is a PascalCase folder holding `<Name>.tsx` + `index.ts`,
with `helpers.ts` / `constants.ts` / `styles.ts` beside it only when they earn the
file. The cross-route tier is kebab-case (`run-cost/`, `confirm-dialog/`), so the tier
is visible at the import site. Hooks are `use<Thing>` in `src/lib/hooks/<area>.ts`;
i18n keys are camelCase dotted paths.

**Tests.** A component's test sits beside it as `<Name>.test.tsx`, a helper's as
`helpers.test.ts` (Vitest + React Testing Library, `fetch` mocked). Real-browser
journeys are the one exception to colocation: `e2e/specs/NN-name.flow.json`.

## Default architecture

Route-anchored feature modules over a domain-free shared tier:

```
src/
  app/                        routes only — thin composition roots
    <route>/
      page.tsx                assembles features, holds no business logic
      _components/<Name>/     UI used by exactly this route subtree
  features/<name>/            a use case, owned end to end
      components/  hooks/  api/  model.ts  constants.ts  types.ts
  components/<name>/          cross-route UI that is still product-specific
  shared|ui/                  design system: domain-free primitives
  lib/                        configured clients, framework plumbing
```

| Tier | May know about | Must not know about |
|---|---|---|
| routes / `app` | every feature, shared | — |
| features | shared, `lib` | other features, routes |
| `components/` (cross-route) | shared, `lib` | features, routes |
| design system (`ui`) | design tokens, its own variants | any domain concept |
| `lib` | the framework, external services | features, routes |

The tier a file sits in is a claim about its dependencies, not about its size or importance.

**Do not let "type" be the outermost axis.** `components/`, `hooks/`, `utils/` at the top level is the failure mode; the same names *inside* a feature are correct. Grouping by kind works within a bounded scope and collapses as the scope of the whole app.

Apply the test to the top-level listing: it should name the product, not the framework.

## Where does X go?

| Adding | Default home | Promote when |
|---|---|---|
| Component rendered by one route | `app/<route>/_components/<Name>/` | a second route renders it |
| Component rendered by 2+ routes, still domain-aware | `components/<name>/` | — |
| Domain-free primitive (Button, Dialog, Stack) | design system tier | — |
| Data fetching | the feature's `api/`, one file per endpoint: types + schema + fetcher + hook | several features hit it → shared `api/` |
| Business rule (pure) | plain function in the feature's `model.ts` | — |
| Stateful logic bound to React | custom hook in the feature's `hooks/` | — |
| Constant used by one module | `constants.ts` beside it | a second module needs it |
| Anything shared by two modules **under the same route** | `helpers.ts` / `constants.ts` **at that route segment** | a second route needs it |
| Cross-cutting config, env, feature flags, design tokens | root `config/` | — |
| Type used once | inline, in the file that uses it | — |
| Type used across a feature | `types.ts` at the smallest scope covering the uses | crosses the wire → shared contract module |
| Formatting/parsing helper, one consumer | `helpers.ts` beside that module | second consumer → nearest common parent |
| Formatting/parsing helper, many consumers | a **domain-named** file (`lib/money.ts`), never `utils/index.ts` | — |
| User-visible string | the message catalog, always — never a constant | — |
| Imperative browser side effect (download, clipboard, print) | the event handler that triggers it | — |

Details and the reasoning behind each row: [placement.md](placement.md).

## Promotion, and the trap inside it

Move code up on the **second consumer** — but *move the code, not an abstraction*. Relocating a file is cheap and reversible. Parameterizing it so it serves both callers is the expensive, hard-to-undo step, and two call sites almost never reveal the real axis of variation.

If a shared module is accumulating flags and conditionals to fit its callers, the abstraction is wrong. Inline it back into each caller, delete what doesn't apply there, and re-extract once the difference is actually visible.

Demotion is symmetrical and under-used: shared code that ends up with one consumer again should move back down.

## Red flags

Each of these means the structure is wrong, not that a rule was bent:

- `features/a` imports `features/b`
- Anything in the shared or design-system tier imports from a feature or a route
- A file named `utils.ts`, `helpers.ts`, or `constants.ts` at the project root
- A barrel that re-exports an unrelated collection (`features/index.ts`, `hooks/index.ts`)
- A module importing **its own** directory's `index.ts`
- A route file (`page.tsx`) containing business logic rather than composition
- A design-system component importing a domain hook (`useCart`, `useCurrentUser`)
- Server data copied into `useState`, Redux or Zustand
- `'use client'` at the top of a layout or a route root
- A component you cannot name the responsibility of without saying "and"

## Deviations — when the default is the wrong answer

The default above is deliberately lighter than the named methodologies. Reach past it only for a stated reason.

| Instead of the default | Adopt when | Cost you are accepting |
|---|---|---|
| Feature-Sliced Design (7 layers, slices, segments) | several teams need one shared mental model across repos; the app is large and long-lived | whole-team buy-in required or layering silently degrades; feature/widget/entity boundary is genuinely ambiguous |
| Clean Architecture layers (domain / use cases / ports / adapters) | the **frontend** holds real rules: pricing, permissions, multi-step workflows, offline or optimistic behaviour | indirection that buys nothing when the rules actually live on the server — which is the usual case |
| Grouping by type at the top level | a genuinely small app, or a library rather than an application | stops working at the first domain split; migrating later is a large diff |
| Separate packages / monorepo | you are already writing `../` between two areas, and want `package.json` exports to enforce the boundary | build and release machinery; decide your verticals *before* splitting |

FSD is worth reading even when not adopting it: its vocabulary for import rules (layers, slices, segments, public API) is the clearest available, and its `@x` notation is the only well-specified escape hatch for a sibling import.

## Reference files

| File | Covers |
|---|---|
| [placement.md](placement.md) | every "where does X go" case, with the reasoning |
| [boundaries.md](boundaries.md) | public API, barrels, cross-feature imports, path aliases, lint enforcement |
| [logic.md](logic.md) | component vs hook vs plain function; the four kinds of state; API layer; validation |
| [composition.md](composition.md) | when to split a component, composition patterns, prop design, layout ownership |
| [app-router.md](app-router.md) | Next.js App Router: the server/client boundary as architecture, DAL, Server Action placement |
| [devdigest.md](devdigest.md) | how these rules map onto this repository |
| [README.md](README.md) | every source behind these rules, grouped by topic |
