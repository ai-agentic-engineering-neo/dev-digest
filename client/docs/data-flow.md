# Data flow: page → hook → API → cache

The route map and the endpoints each page uses are in
[`../README.md`](../README.md). This page covers how the data moves through the
client and which cache key feeds which part of the PR screens. That matters
when something on screen is stale.

## The layers

```
page.tsx / _components   →   src/lib/hooks/*.ts   →   src/lib/api.ts   →   API :3001
      (no fetch)             (TanStack Query)          (apiFetch)
```

- **`src/lib/api.ts`**: `API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001"`
  (`:5`). `NEXT_PUBLIC_*` is inlined at build/dev start, so changing `.env`
  needs a restart. A network failure throws "Cannot reach the DevDigest engine
  at …" (`:37`) instead of a bare `TypeError`.
- **Hooks** own the query key, polling and invalidation. Components never call
  `api` directly.
- **QueryClient defaults** (`src/lib/providers.tsx:24`): `staleTime: 30s`,
  `retry: 1`, no refetch on window focus. Data only refreshes when a hook
  polls, a mutation invalidates, or the page remounts after 30 s.

## PR screens: which key feeds what

| UI | Hook | Query key | Endpoint | Refresh |
| --- | --- | --- | --- | --- |
| PR list rows (score, FINDINGS, COST) | `usePulls` (`src/lib/hooks/core.ts:102`) | `["pulls", repoId]` | `GET /repos/:id/pulls` | polls every 60 s |
| PR header, Overview, Files | `usePullDetail` (`core.ts:114`) | `["pull", prId]` | `GET /pulls/:id` | — |
| Agent runs → **Timeline** (`RunHistory`) | `usePrRuns` (`hooks/reviews.ts:40`) | `["pr-runs", prId]` | `GET /pulls/:id/runs` | every 4 s while any run is `running` |
| Agent runs → **Review runs** (`ReviewRunAccordion` → `VerdictBanner` + `FindingsPanel`) | `usePrReviews` (`reviews.ts:51`) | `["reviews", prId]` | `GET /pulls/:id/reviews` | on invalidation |
| Live review banner | `usePrActiveRuns` (`reviews.ts:28`) + `useRunEvents` (SSE) | `["pr-active-runs", prId]` | `GET /pulls/:id/runs/active`, `GET /runs/:id/events` | every 4 s while non-empty |
| Trace drawer stats, prompt, log | `useRunTrace` (`hooks/trace.ts:12`) | `["run-trace", runId]` | `GET /runs/:id/trace` | — |
| Trace drawer **findings** | *no fetch*: taken from `usePrReviews` data | — | — | — |

The tab is in the URL: `?tab=findings` is the tab labelled **"Agent runs"**
(`_components/PrDetailHeader/PrDetailHeader.tsx:117`). The open trace is
`?trace=<runId>`. Both are read in `src/app/repos/[repoId]/pulls/[number]/page.tsx:60`,
so a trace link can be shared.

The trace drawer's findings come from the review whose `run_id` matches
(`page.tsx:178`). A run with no review (failed, cancelled, or a deleted
review) shows an empty findings section even though the trace exists.

## Invalidation map

| Mutation | Invalidates |
| --- | --- |
| `useRunReview` (`reviews.ts:124`) | `["reviews", prId]`; the header's `onRunsStarted` also invalidates active runs |
| run finished (`onRunDone` in `page.tsx`) | active runs, `["pr-runs"]`, refetch reviews |
| `useDeleteRun` (`reviews.ts:60`) | `["pr-runs"]`, `["reviews"]` |
| `useDeleteReview` (`reviews.ts:81`) | `["reviews"]` only |
| `useFindingAction` accept/dismiss (`reviews.ts:139`) | `["reviews", prId]` **only** |

### Known staleness

Dismissing a finding updates the Review runs card at once. The **Timeline
severity badges** (`["pr-runs"]`) and the **PR list FINDINGS column**
(`["pulls"]`) both exclude dismissed findings on the server, but they are not
invalidated, so they show the old counts until the next poll (list: 60 s), a
remount after `staleTime`, or a reload. If you need them in sync, add those
keys to `useFindingAction.onSuccess`. Don't copy counts into local state.

## Testing implication

Component tests mock `fetch` or the hooks (for example `RunTraceDrawer.test.tsx`
mocks `useRunTrace`), so they don't cover the API shape. Types come from
`@devdigest/shared`, and the real journey is covered by `../e2e`.
