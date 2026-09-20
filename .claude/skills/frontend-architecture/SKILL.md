---
name: frontend-architecture
version: 1.0.0
description: "UI architecture and code organization for React/Next.js — where components, constants, hooks, utils, and business logic live. Use when structuring a new feature, deciding where a file belongs, or reviewing project layout. Complements react-best-practices (component/hook anti-patterns) and next-best-practices (Next.js API conventions) without duplicating them."
---

# Frontend UI Architecture

Where things live, not how they're written. Covers component placement,
when to split a component into a folder, where constants/utils/business
logic belong, and Next.js route-level organization. For code examples, see
[examples.md](examples.md); for sources, see [references.md](references.md).

**See also, and don't duplicate:**
- [react-best-practices](../react-best-practices/SKILL.md) — component
  purity, hooks misuse, state/derivation rules, memoization, a11y. This
  skill assumes those rules and only adds *where* the resulting code lives.
- [next-best-practices](../next-best-practices/SKILL.md) — Next.js API
  mechanics (RSC boundary detection, async `params`, route handlers,
  metadata). This skill only covers *route-level file placement*, linking
  to `rsc-boundaries.md` for the API rules themselves.

## Severity Levels

- **CRITICAL** — Will actively fight the framework or make the codebase
  hard to navigate/scale
- **HIGH** — Will cause real friction as the feature or team grows
- **MEDIUM** — Hurts consistency/discoverability but is cheap to fix later

---

## Layering Overview (HIGH)

Four layers, each with one job. A file's folder should match its layer:

```
UI          — components: render + local presentational state only
Hooks       — data fetching, mutations, subscriptions, derived UI state
Lib/Services — pure business logic, API clients, framework-agnostic code
Shared      — anything promoted because 2+ features need it
```

- UI components call hooks; hooks call lib/services; lib/services never
  import from components or hooks (keeps the dependency direction one-way)
- A component that fetches data directly, or a lib function that imports
  React, is a sign the layering broke down

## Component Placement (CRITICAL)

- Default every new component to **colocated with the feature/route that
  uses it** (e.g. `app/<route>/_components/<Name>/`) — not a global
  `components/` folder
- Promote a component to a shared location only when a **second, unrelated
  feature** needs it — not preemptively "in case it's reused"
- A shared/global components folder is for true cross-cutting chrome
  (app shell, generic UI primitives, layout scaffolding) — never for
  feature-specific UI, even if it "feels generic"
- Nest sub-components under the parent that owns them
  (`ParentName/_components/ChildName/`) when the children have no meaning
  outside that parent

## Component Splitting (HIGH)

Split a single-file component into a folder (`Name.tsx`, `constants.ts`,
`helpers.ts`, `index.ts`, ...) when **any** of these trigger, not on file
size alone:

- It has helper functions, constants, or types that would clutter the
  component file
- It has a test file (tests live next to the component, never in a
  parallel mirror tree)
- It has its own sub-components used nowhere else
- Split along **one axis at a time**: extract non-JSX concerns first
  (constants/helpers) before considering breaking the component itself
  into smaller components — don't do both in the same pass

## Constants Placement (MEDIUM)

- A value used by exactly one component → that component's `constants.ts`
- A value shared by everything under one route/feature → that route's
  `constants.ts`, one level above its `_components/`
- A value used across features → promote to a shared location, same bar as
  promoting a component (a second real consumer, not a hypothetical one)
- Never inline a magic number/string that has a name worth giving it —
  but don't extract a constant used exactly once with an already-obvious
  meaning

## Utils, Helpers & Hooks (HIGH)

Three different jobs, three different homes:

- **`helpers.ts` (colocated, pure functions)** — synchronous derivation
  from data the component/hook already has (formatting, filtering,
  computing a label). No I/O, no React.
- **Hooks** — anything stateful, subscribing, or with side effects
  (fetching, mutations, timers, subscriptions, `useEffect`-worthy work).
  One hook per concern; see `react-best-practices` for hook-internals
  rules.
- **Lib/services** — logic that doesn't depend on a specific
  component/hook and could run outside React (API client calls, pure
  business rules, cross-cutting formatting used by multiple features) —
  this is what a global `utils/` folder should actually hold, if one
  exists at all. A helper local to one component never belongs here.

## Business Logic Placement (CRITICAL)

- All server communication goes through a hook backed by a shared API
  client (e.g. `lib/api.ts`) — never a raw fetch call inside a component
  body
- Loading/error/empty states are handled in the component that owns the
  hook call, not buried inside the hook itself
- UI-local derivation (formatting a date for display, computing a CSS
  class) stays in the component's own `helpers.ts` — it is not "business
  logic" and does not belong in `lib/`
- If a business rule needs to be enforced identically in two places
  (client validation + something else), it belongs in `lib/`, imported by
  both — never duplicated

## Feature Module Boundaries (MEDIUM)

- A feature/route folder's public surface is what it exports from its
  `page.tsx`/`index.ts` — nothing outside the feature imports from inside
  another feature's `_components/`
- If two features need to share a component/hook/constant, that's the
  signal to promote it to a shared location (see Component Placement) —
  not to import across feature boundaries
- Barrel files (`index.ts` re-exporting) are for the folder's public API,
  not a place to dump unrelated re-exports

## Next.js Route Architecture (HIGH)

- Route-local components live in a `_components/` (or similarly
  underscore-prefixed) folder inside the route segment — the `_` prefix
  opts it out of routing, so this is safe by default in the App Router
- Prefer explicit private folders over relying on "anything without
  `page.tsx`/`route.ts` isn't routable" — it keeps intent obvious in the
  file tree and avoids future naming collisions with new Next.js file
  conventions
- Push `'use client'` as far down the tree as possible — a route's
  `page.tsx` and layout stay Server Components by default; only the
  interactive leaf gets the directive. See
  [next-best-practices/rsc-boundaries.md](../next-best-practices/rsc-boundaries.md)
  for what's an invalid boundary, not covered here
- Route-level shared state (constants/helpers used by multiple
  `_components/` under the same route) goes one level up, next to
  `page.tsx` — not duplicated into each component folder

## Growth & Refactoring Triggers (MEDIUM)

Concrete signals it's time to reorganize, not vibes:

- A "shared" component gets a second consumer with slightly different
  needs → split into a shared base + feature-specific wrapper, don't add
  branching props for each caller
- A hook file accumulates unrelated concerns (fetching + form state +
  analytics) → split into separate hooks named for what they each do
- A feature folder's `_components/` grows past ~10-15 entries with no
  sub-grouping → look for a natural sub-feature boundary to nest under
- The same constant/helper gets copy-pasted into a second feature →
  promote it immediately, don't wait for a third copy
