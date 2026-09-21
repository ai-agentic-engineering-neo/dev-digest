# Next.js Organization

Where App Router route UI belongs specifically — colocation via private
folders, and how that interacts with the feature-based layout in
[folder-structure.md](folder-structure.md). For component-splitting and
business-logic placement inside a route's components, see
[component-organization.md](component-organization.md). For routing
mechanics themselves (route segments, RSC boundaries, metadata, async
APIs) defer to the `next-best-practices` skill — this file only covers
*where* route-local code lives.

## Route-Local UI via Private Folders

A route's UI, layout, or data fetching in the App Router should be
colocated inside the route segment using a **private folder** (`_`-prefixed,
so Next.js doesn't treat it as routable) rather than placed in a distant
global folder. A segment only becomes a public route once it has a
`page.tsx`/`route.ts` — everything else inside that segment can be safely
colocated, including a private folder's contents.

### Example

```
// BAD: route-specific components scattered in a distant global folder
src/
├── app/dashboard/orders/page.tsx
└── components/
    ├── OrderStatusFilter.tsx   // only used by /dashboard/orders
    ├── OrderTable.tsx          // only used by /dashboard/orders
    └── OrderSummary.tsx        // only used by /dashboard/orders

// GOOD: colocated with the route using a private folder (the `_` prefix
// keeps Next.js from treating it as a route segment)
src/app/dashboard/orders/
├── page.tsx
└── _components/
    ├── OrderStatusFilter.tsx
    ├── OrderTable.tsx
    └── OrderSummary.tsx
```

This is the same "colocate first, promote later" rule from
[folder-structure.md](folder-structure.md) applied to a route segment: a
component only migrates out to the shared `components/` folder once a
second, unrelated route needs it too.

## Applied in This Repo (dev-digest)

`client/` (`@devdigest/web`) follows this exactly, with its own naming
convention on top: route-local components live in
`client/src/app/<route>/_components/<PascalCaseName>/` (e.g.
[client/src/app/agents/\_components](../../../client/src/app/agents/_components)),
with `<Name>.tsx` plus an optional `.test.tsx`/`helpers.ts`/`styles.ts`
alongside it.

- **PascalCase** naming applies inside `_components/` — this is the
  repo's signal for "still route-local." When a component is promoted to
  the shared layer it switches to kebab-case under
  `client/src/components/` (see
  [folder-structure.md](folder-structure.md#applied-in-this-repo-dev-digest)) —
  don't rename a component's case without also moving it.
- Before adding a new route-local file, check
  [client/AGENTS.md](../../../client/AGENTS.md) (`client/CLAUDE.md` points
  here) — it is the authoritative source for this package's naming and
  should win over this skill's generic folder names whenever they conflict.

## Checklist (for reviews)

1. Is a route-specific component sitting in a global `components/` folder
   instead of that route's `_components/`? → colocate it.
2. Does a private folder's naming/case match the repo's own convention
   (PascalCase under `_components/`) rather than this skill's generic
   example? → repo convention wins.
