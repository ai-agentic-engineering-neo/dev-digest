# client — UI architecture

Deeper reference for the route map summarized in [`../CLAUDE.md`](../CLAUDE.md)
and diagrammed in [`../README.md`](../README.md#ui-route-map).

## Data flow

`page.tsx` → a hook from `src/lib/hooks/*` → `src/lib/api.ts` → the Fastify
API at `NEXT_PUBLIC_API_BASE`. No component calls `fetch` directly — this is
what makes the vitest suite work without a real API (only `src/lib/api.ts`'s
`fetch` needs mocking).

Hooks are grouped by domain, not by page:

- `hooks/core.ts` — repos, pulls, polling
- `hooks/reviews.ts` — runs, findings, accept/dismiss
- `hooks/agents.ts` — agent CRUD
- `hooks/repo-intel.ts` — index state, resync
- `hooks/trace.ts` — SSE run-trace subscription

TanStack Query owns all server-state caching; there is no separate global
store (Redux/Zustand). Local-only UI state (open/closed, form drafts) stays
in component state or `src/lib/*.tsx` context providers (`repo-context.tsx`,
`theme.tsx`, `toast.tsx`).

## Route → component structure

Pages under `src/app/**/page.tsx` stay thin: data fetching + layout only.
Feature logic lives in colocated `_components/<Name>/` folders next to the
page that uses them, each with its own `*.test.tsx` — so a feature's tests
live next to the feature, not in a parallel test tree.

Cross-cutting chrome (top nav, breadcrumbs, the `g`-then-key shortcut
dispatcher) lives in `src/components/app-shell`, mounted once from
`layout.tsx`, not re-implemented per route.

## Vendored code

`src/vendor/ui` (`@devdigest/ui`) and `src/vendor/shared` (`@devdigest/shared`)
are copied in, not npm-installed — there's no version to bump, only a diff to
reconcile by hand against the source (the server's copy, for `shared`). See
root [CLAUDE.md](../../CLAUDE.md) for the sync convention.

## i18n

`next-intl` messages live in `messages/<locale>/*.json`. A page or component
that renders user-facing copy pulls it from there via the `next-intl` hooks —
it does not inline English strings, even though the starter only ships one locale.
