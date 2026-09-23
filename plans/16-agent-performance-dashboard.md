# Agent Performance Dashboard — Implementation Plan

## Source requirements

No formal `specs/16-*.md` was written; requirements came directly from a task
brief (Ukrainian, paraphrased) plus a mockup screenshot, clarified with the
user before planning. Summary of the request:

- Add "Agent Performance" to the global sidebar.
- Support 1 day, 30 days, and a custom date range.
- Show Total runs, Total cost, Avg accept rate, Most-active agent.
- A table: Agent, Runs, Avg cost, Avg duration, Accept rate, Last run, View.
- Cost breakdown by agent and by model.
- Reuse the same API and aggregation rules as the per-agent Stats tab.
- Zero model calls — reads only stored runs/findings.
- Show the accept-rate denominator and run count for the selected period.
- Sort by accept rate only for agents with enough decisions, or mark small
  samples clearly.

**Acceptance criteria (from the brief):**
- AC-1: runs/cost/duration/accept-rate match the per-agent Stats view for the
  same agent and period.
- AC-2: Total cost equals the sum of counted runs; the by-agent and by-model
  breakdowns each sum to the same total.
- AC-3: Most-active agent is determined by run count in the selected period.
- AC-4: an agent with zero runs and a fully empty dashboard are distinct,
  correct states.
- AC-5: loading and error states never render invented zeros.
- AC-6: reload, sort, and row-expand never trigger a review or a model call.
- AC-7: cost metrics clearly distinguish a DevDigest estimate from reconciled
  billing data.

### Premise correction (found during exploration, not assumed)

The brief's premise is inverted from this repo's actual state:

| Brief assumes | Verified reality |
|---|---|
| A per-agent **Stats tab already exists** | **It does not.** `AgentStats` is declared at `server/src/vendor/shared/contracts/observability.ts:104-135` with no route, no hook, no component. `client/src/app/agents/[id]/_components/AgentEditor/constants.ts:11` says "later lessons add Stats". |
| The global dashboard is **new** work | **It already ships**, at `/agent-performance` — nav entry, route, sortable table, both cost donuts, loading/empty/error states, a component test. Built under `specs/14-export-to-ci.md` AC-40…AC-48, commit `8594b7d`. |

This plan therefore: (a) fixes real correctness gaps in the shipped dashboard,
and (b) builds the per-agent Stats tab from the *same* query the dashboard
uses, so AC-1's "same API, same rules" is literal rather than aspirational.

## Clarifications & recommendations

Asked and answered directly with the user before planning (no spec-creator
pass — see "Execution mode"):

1. **Cost provenance** — add `agent_runs.cost_source` (`'provider' |
   'estimated'`), populated from whether OpenRouter's `usage.cost` extension
   was present on the call. *Chosen: yes, add the column* (rejected: UI-label-only,
   and reconciliation-hook-for-later as premature).
2. **Small-sample rule for accept rate** — threshold **≥ 20 decisions**
   (`accepted + dismissed`); below that, the rate still renders with a
   low-sample marker and sorts to the bottom of an accept-rate sort regardless
   of direction. *Chosen over a ≥10 threshold and over "no threshold, always
   show n".*
3. **Deliverable for this planning step** — a plan file only, following this
   repo's `plans/NN-slug.md` convention, no formal `specs/16-*.md`. *Chosen
   over running spec-creator, since the brief + one clarification round was
   sufficient signal for a change of this size.*
4. **Build the Stats tab too**, rather than leaving `View` pointed at the CI
   tab or building only the Stats tab. *Chosen because AC-1 is otherwise
   unverifiable — there is nothing to reconcile against.*
5. **Range control**: 1 / 7 / 30 / 90 presets **plus** a custom from–to picker,
   keeping the two presets the shipped page already has rather than dropping
   them per the brief's literal "1 day and 30 days" wording. This supersedes
   `specs/14-export-to-ci.md` decision **D12** ("fixed preset set … no custom
   picker") — annotate that file rather than silently overriding it.
6. **Trend/delta visuals** in the mockup (sparkline, `-$1.20` delta, gauge
   ring, row arrows) — build real previous-period comparison and a per-day
   `trend` series server-side, rather than shipping the tiles without them or
   deltas-only. Pure aggregation over already-stored rows; no new model calls.
7. **`summary.avg_accept_rate`** switches from an unweighted mean of
   per-agent rates to **pooled** `sum(accepted) / sum(accepted + dismissed)`,
   correcting `specs/14-export-to-ci.md` AC-42's original behavior (where a
   2-decision agent moves the workspace number as much as a 250-decision one)
   so it reconciles with AC-2.

### Additional recommendations (implementer's own findings, not asked as
questions — flagged here for visibility)

- **D1**: `performanceRows` counts `running`/`failed` runs (cost/duration
  always `null`) into the `runs` denominator used for `avg_cost_usd` and
  `avg_latency_ms`, understating both. Fix: track a separate counted-runs
  denominator.
- **D2**: runs are windowed by `agentRuns.ranAt`, but findings are windowed by
  `reviews.createdAt` — a run just inside the period whose review committed
  just outside it silently loses its findings. Fix: window findings via the
  run's own `ranAt`.
- **D3**: `SortField` already declares `"total_cost_usd"` but `AgentTable`
  never wires a sortable header for it — dead code. Fix while touching the
  table anyway.
- **D4**: the loading skeleton renders two 90px blocks for what becomes four
  tiles + a table + two donuts. Cosmetic, fix while touching the view.

## Execution mode

Single-agent pass. The change is well-scoped once premise and clarifications
are locked, touches a known set of files across two modules plus
`reviewer-core`, and doesn't need independent multi-agent parallelization —
server and client changes are sequentially dependent (contract changes must
land before the client can consume them).

## Modules affected

- **server** — schema migration, `reviewer-core` cost-source threading is
  consumed here via `run-executor.ts`, `ci` module repository/service/routes,
  new `agents` module route, both `vendor/shared` contract copies.
- **reviewer-core** — `openrouter.ts` and `review/run.ts` gain `costSource`
  on the LLM result and `ReviewOutcome`.
- **client** — `/agent-performance` view/table/hook, a new Stats tab on the
  agent editor, i18n strings, `vendor/ui` `MetricCard` gets one new optional
  prop.
- **e2e** — extend an existing flow to cover the dashboard; no new flow file
  unless review turns up a gap.

## Architectural constraints

- **Onion layering (`onion-architecture` skill, `docs/architecture.md:11-22`,
  `server/.dependency-cruiser.cjs`)**: routes → service → repository, inward
  only. The new `GET /agents/:id/stats` route needs `performanceRows`, which
  lives in the `ci` module's repository — `.dependency-cruiser.cjs:64-74`
  (`no-cross-module`) forbids importing another module's class directly, so
  this must go through a narrow port wired in `platform/container.ts`,
  mirroring the existing `AgentLookup` port already wired into `ciService`
  (`container.ts:329-347`).
- **Migrations are not applied on boot** (root `CLAUDE.md`) — `pnpm
  db:migrate` required after generating the new column.
- **Shared Postgres across worktrees** (root `CLAUDE.md`) — generate the
  `cost_source` migration from one worktree only, to avoid an `idx` collision
  with any other worktree also running `db:generate`.
- **`vendor/shared` is two independent, manually-synced copies** (root
  `CLAUDE.md`, `server/CLAUDE.md`, `client/CLAUDE.md`) — every contract field
  added to `AgentPerf`/`AgentPerfRow`/`AgentStats` must be hand-applied to
  both `server/src/vendor/shared/contracts/...` and
  `client/src/vendor/shared/contracts/...`, then diffed before commit.
- **`vendor/ui` is vendored, not a dependency** (`client/CLAUDE.md`) — treat
  `MetricCard.tsx` as owned source; the one prop addition there is a real
  edit, not a version bump.
- **Client data-access rule** (`client/CLAUDE.md`): no `fetch` in components —
  all reads go through `src/lib/hooks/*` → `src/lib/api.ts`.
- **i18n**: new UI strings go in `client/messages/en/agentPerformance.json`
  (and any per-tab namespace for the new Stats tab), never inline literals.
- **Null-is-not-zero convention**, established by `specs/01-run-cost-badge.md`
  and already load-bearing in AC-46 of spec 14: unknown cost, unknown
  accept-rate denominator, and no-prior-period delta must all render as `—`/`N/A`,
  never `0` or `$0.00`.

## Approach

### 1. Migration

`server/src/db/schema/runs.ts` — add `costSource: text('cost_source', { enum:
['provider', 'estimated'] })`, nullable, beside `costUsd` (`runs.ts:34`). Run
`cd server && pnpm db:generate` from a single worktree, then `pnpm db:migrate`
locally before testing. Pre-existing rows stay `NULL`, surfaced as "unknown
provenance", never guessed.

### 2. Thread cost source through reviewer-core

- `reviewer-core/src/llm/openrouter.ts:96-107` — where `costFromApi` is set
  from OpenRouter's `usage.cost` extension and the fallback is
  `this.estimateCost?.(...)` (backed by `server/src/adapters/llm/pricing.ts:10-41`,
  explicitly "approximate public list prices"), also return which branch fired
  as `costSource: 'provider' | 'estimated' | null`.
- `reviewer-core/src/review/run.ts:130,182,207,239` — `ReviewOutcome` gains
  `costSource`. Map-reduce chunks aggregate conservatively: `'provider'` only
  if every chunk reported provider cost, else `'estimated'` — mirroring the
  existing null-collapse rule for `costUsd` at `run.ts:207`.
- `server/src/modules/reviews/run-executor.ts:363,439` — stop discarding the
  new field; persist `costSource` onto the `agent_runs` row alongside
  `costUsd`, following the exact pattern `specs/01-run-cost-badge.md`
  documents for `costUsd` itself.

### 3. Repository — `server/src/modules/ci/repository.ts`

`performanceRows(workspaceId, from)` → `performanceRows(workspaceId, from, to)`:
- select `status` and `costSource` in the existing `runRows` query (`:410-422`);
- window `findingRows` by the run's `ranAt` via the `reviews.runId` join
  instead of `reviews.createdAt` (fixes D2, `:424-432`);
- track `costedRuns`/`timedRuns` alongside `runsLocal`/`runsCi` (fixes D1);
- accumulate `costProvider`/`costEstimated`/`costUnknown` sub-totals from
  `costSource`;
- bucket runs per day into `runsByDay` for the `trend` field the contract
  already declares but the server hardcodes empty (`service.ts:868`,
  `AgentPerfView.tsx:9-15`).

`costByModel(workspaceId, from)` → add the same `to` upper bound (`:471-483`).

Keep the existing "pull rows, reduce in a JS `Map`" shape (`:442-465`) — this
repo's established pattern here, and the new per-day/per-source splits are
awkward as a single SQL aggregate.

### 4. Service — `server/src/modules/ci/service.ts`

`agentPerformance(workspaceId, range)`, `range: { days: number } | { from:
Date; to: Date }`:
- resolve `[from, to)`, and separately compute the immediately-preceding
  equal-length window for deltas;
- per-agent `runs_delta`/`accept_rate_delta`/`cost_delta`, `null` (never `0`)
  when no prior-period data exists;
- switch `summary.avg_accept_rate` (`:874`) to pooled
  `sum(accepted) / sum(accepted + dismissed)`;
- keep `most_active_agent` as run-count-in-selected-period (`:875`, already
  correct — AC-3), and also return its run count + accept rate for the tile's
  `"142 runs · 78% accept"` sub-line;
- `PERF_RANGE_PRESETS` (`:33`) becomes `[1, 7, 30, 90]`.

### 5. New route — `GET /agents/:id/stats`

In `server/src/modules/agents/routes.ts`, backed by the same `performanceRows`
query scoped to one `agentId` (via the port described in "Architectural
constraints"), filling the dormant `AgentStats` contract
(`observability.ts:104-135`) including its `pending` field (findings with
neither `acceptedAt` nor `dismissedAt`, currently excluded from every
denominator and invisible anywhere).

### 6. Route query schemas — `server/src/modules/ci/routes.ts`

`PerfQuery` (`:36-39`): replace the `[7,30,90]` refine with a union accepting
either `range_days ∈ [1,7,30,90]` or `from`+`to` as `z.string().datetime()`,
reusing the pattern already in `RunsQuery` (`:18-25`). Reject `from >= to` and
cap the span to bound the query.

### 7. Contracts (both copies)

`AgentPerf`/`AgentPerfRow` (`productionize.ts:135-193`) and `AgentStats`
(`observability.ts:104-135`) gain: `counted_runs`, `costed_runs`,
`cost_by_source`, `runs_delta`, `accept_rate_delta`, `cost_delta`,
`decisions`, `low_sample: boolean`, and `range: { from, to }` on the summary.
Apply identically to `server/src/vendor/shared/...` and
`client/src/vendor/shared/...`, then diff the two files.

### 8. Client — `/agent-performance`

- `constants.ts:2` → `[1, 7, 30, 90]`; add a "Custom" option to the existing
  radiogroup (`AgentPerfView.tsx:64-86`) that opens a small local
  `_components/RangePicker/` (no existing `DateRangePicker` in
  `vendor/ui` to reuse — build local first, promote only if a second caller
  appears). Selected range goes into the URL query.
- Tiles: feed `MetricCard`'s existing `trend`/`delta`/`suffix` props
  (`vendor/ui/charts/MetricCard.tsx`) with `runs_by_day` and the cost delta;
  add one new optional `deltaLabel?: string` prop to `MetricCard` since it
  currently renders a bare unit-less number for `delta`. Accept-rate tile uses
  `CircularScore` (`vendor/ui/primitives/CircularScore.tsx`) for the gauge ring.
- Cost tile shows a provenance line ("$6.10 reconciled · $2.64 estimated"),
  with a note (next to the existing `ciOnlyNote` pattern, `AgentPerfView.tsx:118`)
  when a period mixes or has unknown-provenance cost — this is AC-7.
- `AgentTable.tsx`: accept-rate cell renders the denominator (`78% (110/142)`);
  agents under 20 decisions get a low-sample chip and `sortAgents`
  (`helpers.ts:7-17`) gains a tier so they sort last in either direction,
  reusing the existing null-sorts-last mechanism; wire the remaining sortable
  headers (D3); add a client-side row-expand showing
  accepted/dismissed/pending and cost-by-source; repoint `View` from
  `?tab=ci` (`AgentTable.tsx:76`) to `?tab=stats`.
- Loading skeleton reshaped to match the real layout (D4).
- Distinct states: workspace-empty (existing `EmptyState`), agent-with-no-runs-
  in-period (row of `—` with a distinct marker, not `0`), loading (no digits),
  error (existing `ErrorState` + retry, no digits) — AC-4/AC-5.

### 9. Client — new Stats tab

Add `{ key: "stats", labelKey: "editor.tabs.stats", icon: "BarChart3" }` to
`AgentEditor/constants.ts:12-18`, plus a `StatsTab/` folder built against
`GET /agents/:id/stats`, structurally modeled on
`client/src/app/skills/.../StatsTab/` (same tab shape, different domain) and
sharing the same period selector as the dashboard so AC-1's reconciliation is
a like-for-like comparison.

### 10. No-model-calls guarantee (AC-6)

The page and tab only ever call `GET /agents/performance` and
`GET /agents/:id/stats`. Sorting, row-expansion, and range switches are local
state or cached TanStack Query reads — no run-trigger hook may be imported
into these files. Verified by test (see below) and by manual network-tab
inspection.

## Skills for implementer

- `server/src/db/schema/**`, `server/src/modules/**` → `onion-architecture`,
  `drizzle-orm-patterns`, `fastify-best-practices`, `zod`.
- `server/src/vendor/shared/**`, `client/src/vendor/shared/**` → `zod` (no
  dedicated skill for the hand-sync convention; follow root/`server`/`client`
  `CLAUDE.md` literally).
- `client/src/app/agent-performance/**`, `client/src/app/agents/[id]/**` →
  `frontend-ui-architecture`, `react-best-practices`, `next-best-practices`.
- `client/src/vendor/ui/charts/MetricCard.tsx` → `react-best-practices`
  (treat as owned source per `client/CLAUDE.md`, not a dependency).
- Any new/changed test file → `react-testing-library` (client),
  `drizzle-orm-patterns`/plain Vitest (server).
- `reviewer-core/src/llm/openrouter.ts`, `review/run.ts` → no dedicated
  skill; follow existing null-collapse and cost patterns in-file.

## Verification

```bash
git checkout -b feat/16-agent-performance-dashboard   # done
cd server && pnpm db:migrate        # migrations do NOT run on boot
./scripts/dev.sh
```

Manual:
1. Run reviews on 2–3 agents so data spans the 1-day boundary.
2. Open `/agent-performance`; check 1d, 30d, and a custom range.
3. **AC-1**: pick one agent, note its row, open its Stats tab at the same
   period — runs/cost/duration/accept-rate must match exactly.
4. **AC-2**: Total cost = sum of the table's per-agent column = sum of the
   by-agent donut = sum of the by-model donut.
5. **AC-3**: switch 1d ↔ 30d, confirm most-active agent tracks the
   period, not all-time.
6. **AC-4/AC-5**: exercise all four states (workspace-empty, agent-with-no-
   runs-in-period, loading, error) — confirm no invented zeros anywhere.
7. **AC-6**: with server logs open, reload/sort/expand/switch range — confirm
   zero review executions; network tab shows only the two GETs.
8. **AC-7**: confirm a provider-priced run shows "reconciled", a price-book
   run shows "estimated", and a pre-migration run shows "unknown".

Automated (scoped first, full suite before push per `plans/README.md`):
```bash
cd server && pnpm vitest run src/modules/ci src/modules/agents src/modules/reviews
cd server && pnpm typecheck
cd client && pnpm vitest run src/app/agent-performance src/app/agents
cd client && pnpm typecheck
cd reviewer-core && pnpm test
cd evals && pnpm eval:quality      # blocking CI gate — only if any .claude/skills or eval files touched
./scripts/e2e.sh                   # once the flow extension lands
```

Then full suites (`pnpm test` in `server`/`client`) and `/pr-self-review`
before opening the PR — its dependency-cruiser and contract-drift checks are
what catch a one-sided `vendor/shared` edit.
