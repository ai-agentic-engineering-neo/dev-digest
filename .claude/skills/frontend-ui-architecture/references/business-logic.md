# Business logic — separating it from UI

Contents: [Layers](#layers) · [API layer](#1-api-layer) · [Server-state hooks](#2-server-state-hooks) ·
[Domain functions](#3-domain-functions) · [UI hooks](#4-ui-orchestration-hooks) ·
[Components](#5-components) · [Container/presentational today](#containerpresentational-today) ·
[Refactoring recipe](#refactoring-a-fat-component)

## Layers

React is the **view** layer. Everything that isn't "turn data into markup" moves out of it
(Juntao Qiu / martinfowler.com, profy.dev clean React architecture):

```
component  ──uses──▶  UI hook  ──uses──▶  server-state hook  ──uses──▶  API layer  ──▶ HTTP
     │                   │
     └──────uses─────────┴──────▶  pure domain functions (helpers / lib)
```

Arrows point one way. The API layer knows nothing about React; domain functions know nothing
about React or HTTP.

## 1. API layer

- One module owns transport: base URL, headers, JSON parsing, error mapping
  (DevDigest: `src/lib/api.ts` with `apiFetch`, `api.*`, `ApiError`).
- Components never call `fetch` or build endpoint URLs.
- Endpoints are typed with the shared contracts (`@devdigest/shared`); validate at the edge if
  the project does.
- Swapping HTTP library or endpoint shape touches only this file.

## 2. Server-state hooks

- One file per domain (`src/lib/hooks/reviews.ts`, `agents.ts`, …) holding `useQuery` /
  `useMutation` wrappers.
- Query keys are defined in one place per domain (a key factory or `queryOptions` helpers —
  TkDodo), so invalidation and prefetching don't hard-code arrays across the app.
- Hooks return data + status; side-effects of mutations (invalidate, toast) live in the hook,
  not in each caller.

Illustrative (DevDigest hooks currently inline their key arrays — e.g.
`["pr-active-runs", prId]`; extract a factory when a domain's keys are reused for invalidation):

```ts
// src/lib/hooks/reviews.ts — illustrative
export function usePrReviews(prId: string) {
  return useQuery({ queryKey: reviewKeys.list(prId), queryFn: () => api.reviews(prId) });
}
```

## 3. Domain functions

Pure functions: input → output, no React, no I/O, no `Date.now()` hidden inside (pass it in).
They hold the rules a product person would recognise: "a PR is stale if…", "group findings by
severity", "format a line range".

- One component/route uses it → `helpers.ts` next to it.
- Several areas use it → `src/lib/<domain>.ts`.
- They are the cheapest code to unit-test — test them directly.

```ts
// FindingCard/helpers.ts
export function lineLabel(f: Pick<FindingRecord, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}
```

## 4. UI orchestration hooks

Stateful UI flow that isn't server data: selection, expand/collapse, keyboard navigation,
multi-step forms, optimistic toggles. Extract into `useX` when it makes the component hard to
read or is shared (react.dev — *Reusing Logic with Custom Hooks*). Name hooks after the
behaviour (`useFindingSelection`), not after the component (`useFindingCardLogic`).

## 5. Components

The component body should read top-to-bottom as (illustrative):

```tsx
export function PullsPage() {
  const { data, isLoading, error } = usePulls(repoId);   // data
  const rows = sortPulls(filterByStatus(data, status));   // pure derivation
  if (isLoading) return <Skeleton />;                     // states
  return <Table rows={rows} />;                           // render
}
```

Event handlers are short: they call a hook action or mutation, maybe a pure helper — they don't
contain the rule itself.

## Container/presentational today

Dan Abramov (2019 update) no longer recommends splitting every component into container and
presentational halves: **custom hooks** now carry the stateful logic. Use the split only where it
pays off — e.g. a shared component in `src/components/` that must stay data-agnostic gets its
data as props from a route-local wrapper.

## Refactoring a fat component

1. Move `fetch`/URL code into the API layer; wrap it in a domain hook.
2. Pull each pure calculation into a named function in `helpers.ts`; add a unit test.
3. Move UI state machinery into a `useX` hook beside the component.
4. Split remaining JSX into sub-components by region.
5. Check the placement ladder for every new file.
