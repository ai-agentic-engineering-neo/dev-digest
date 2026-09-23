# How data reaches a component

The client has exactly one path from the API to the screen. This is the
"data flows exclusively through TanStack Query hooks" rule from
[`../CLAUDE.md`](../CLAUDE.md) spelled out, with the reasons.

```
Fastify (:3001)
   └── lib/api.ts        apiFetch → ApiError normalization
        └── lib/hooks/<domain>.ts   useQuery / useMutation, cache keys
             └── page.tsx / _components/**   render only
```

## `lib/api.ts` — the only `fetch`

`apiFetch<T>` is the single place a network request is made. It does two jobs
beyond calling `fetch`:

- **Normalizes every failure into `ApiError`** with `status`, `code`, `details`.
  The error-UX taxonomy (toast vs inline vs full-screen) branches on `status`,
  which only works if every error has one. A network failure — API down — is
  given `status: 0` and code `network_error` with a message naming the base
  URL, because that's the single most common local-dev failure.
- **Only declares a JSON content-type when a body is actually sent.** A
  body-less `POST`/`PUT` (tour generate, refresh, reindex) otherwise trips
  Fastify's "Body cannot be empty when content-type is application/json" —
  a 400 that reads like a server bug.

`API_BASE` comes from `NEXT_PUBLIC_API_BASE`, defaulting to
`http://localhost:3001`. A mismatch here fails **silently**: dev and vitest both
pass while every query 404s and the studio renders empty. Check it first.

## `lib/hooks/<domain>.ts` — where the cache lives

Hooks are grouped by domain (`core.ts` for settings/secrets/repos/pulls,
`reviews.ts`, `agents.ts`, `trace.ts`, `repo-intel.ts`), re-exported from
`hooks/index.ts`. Components import from the barrel.

Each hook owns its query key and its invalidation. Mutations either
`setQueryData` with the server's response (`useUpdateSettings`) or invalidate
the keys that a write can change — e.g. saving a provider key invalidates the
model lists, because which models resolve depends on it.

## Components render, they don't fetch

A component calling `fetch` directly would bypass the cache, the error
normalization and the invalidation graph at once — three invisible regressions
from one convenient line. The rule is absolute, and the payoff shows up in
places like `FindingsPanel`: the findings array is already in memory from
`usePrReviews`, so counting findings by severity or filtering them is a plain
`Array.filter` with **no** request — which is what makes the severity counters
demonstrably LLM-free (see [`../specs/severity-filter.md`](../specs/severity-filter.md)).

This is also why tests mock `fetch` globally rather than mocking hooks: if a
component ever did reach the network, the test would catch it.

## Wire shapes stay wire-shaped

Server DTO fields keep `snake_case` all the way into JSX (`cost_usd`,
`findings_by_severity`, `head_sha`). Renaming at the boundary would mean two
names for one field and a mapping layer to keep in sync, for no gain. Only
local variables are `camelCase`.

## `src/vendor/*` is a copy, not a dependency

`src/vendor/shared` and `src/vendor/ui` are **copied** from `server`, not
installed. They are not the source of truth and syncing is manual — which means
a contract can drift between the two copies without any build error. This has
already happened once (`client/INSIGHTS.md`, 2026-09-20: a trace contract field
added on the server was missing here). When changing a contract, change both
copies in the same commit.
