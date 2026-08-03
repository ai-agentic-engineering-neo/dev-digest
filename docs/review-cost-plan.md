# Review cost — PR list, Agent runs tab, Trace drawer

## Context

Reviews already have a real dollar cost — `reviewer-core`'s `reviewPullRequest()`
computes `outcome.costUsd` end-to-end today (every LLM provider adapter —
OpenAI, Anthropic, OpenRouter — already populates `costUsd` on its completion
result via `estimateCost()`/`PriceBook`), but the number is silently dropped
in `run-executor.ts` and never persisted or shown anywhere. The user wants it
surfaced on three design screens (screenshots supplied, root of the repo):

1. **Pull Requests list** — a COST column between STATUS and UPDATED.
2. **PR detail → Agent runs tab** — cost next to each run's time, in both the
   compact TIMELINE row and the REVIEW RUNS accordion cards.
3. **Agent run trace drawer** — a COST stat between TOKENS and FINDINGS.

Confirmed decisions:
- PR-list cost = **sum** of `cost_usd` across every agent run ever executed
  against that PR (not just the latest review — mirrors nothing existing,
  it's a new sum, unlike SCORE which is latest-only).
- One shared formatter everywhere, **3 decimal places** (`$0.014`, `$0.001`).
- The TIMELINE row gets **cost only** — do not add a tokens display there
  (it doesn't render tokens today; leave that as is).

## Nullability contract (why each field is shaped this way)

| Contract | Field | Shape | Reasoning |
|---|---|---|---|
| `RunStats` (`trace.ts`) | `cost_usd` | `z.number().nullable()` | First nullable field in an otherwise all-required object — unpriced models genuinely have unknown cost, unlike tokens. Comment this in the schema so it doesn't get "fixed" back to non-nullable later. |
| `RunSummary` (`trace.ts`) | `cost_usd` | `z.number().nullable()` | Matches every sibling (`duration_ms`, `tokens_in`, `score`, `blockers`, …), all `.nullable()`. |
| `PrMeta` (`platform.ts`) | `cost_usd` | `z.number().nullish()` | Matches `score`'s `.nullish()` — the `/pulls/:id` handler never sets this key at all (genuinely absent, not just null), same as score. |
| `ReviewRecord` (`review-api.ts`) | `cost_usd` | `z.number().nullable()` | `reviewToDto()` always explicitly sets every field (no omission) — matches `score`/`verdict`'s `.nullable()`. |

Cost is `null` (not `0`) when unknown — Postgres `SUM()` ignores NULLs and
returns NULL only when every row in a group is NULL, which composes correctly
with the JS `Map`-based aggregation below.

**Free models are a real, distinct case, not a hypothetical.**
`server/src/adapters/llm/pricing.ts:30` already has
`'z-ai/glm-4.7-flash': { in: 0, out: 0 }, // free baseline for evals` — so
`estimateCost()` legitimately returns an exact `0`, not `null`, for that
model today. `0` (known, free) must read differently from `null` (unknown)
and from a nonzero-but-sub-$0.001 run (which would otherwise *also* round to
`$0.000` at 3 decimals and look free when it isn't). Confirmed display rule:
`null` → `—`, exact `0` → `Free`, `0 < usd < 0.001` → `<$0.001`, else
`$X.XXX`.

## Implementation, in order

### 0. Save this plan into the repo
Copy this plan document to `docs/review-cost-plan.md` (root `docs/` already
exists and is the repo's cross-cutting reference-docs location per root
`CLAUDE.md`) — do this first, before any code change, so the spec is
committed alongside the feature it describes.

### 1. DB schema + migration
- `server/src/db/schema/runs.ts` — add `doublePrecision` to the pg-core
  import (currently missing it); add `costUsd: doublePrecision('cost_usd'),`
  to `agentRuns` (after `blockers`).
- `server/src/db/schema/reviews.ts` — add `costUsd: doublePrecision('cost_usd'),`
  to `reviews` (this file already imports `doublePrecision`, used by
  `findings.confidence`).
- Run `cd server && pnpm db:generate` — produces the next migration
  (`0010_<slug>.sql`, current tail is `0009_complex_runaways.sql`) with two
  `ALTER TABLE ... ADD COLUMN cost_usd double precision` statements. Nullable,
  no default — metadata-only DDL, safe on the seeded dev DB.
- Run `cd server && pnpm db:migrate` to apply.

### 2. Shared contracts (edit BOTH vendor copies — server AND client) + i18n
Per the root `CLAUDE.md`: `@devdigest/shared` is hand-copied into
`server/src/vendor/shared` and `client/src/vendor/shared`; every contract
edit below must land identically in both trees.

- `contracts/trace.ts` (both copies) — add `cost_usd` to `RunStats` and
  `RunSummary` per the nullability table above.
- `contracts/platform.ts` (both copies) — add `cost_usd` to `PrMeta`.
- `contracts/review-api.ts` (both copies) — add `cost_usd` to `ReviewRecord`.
- `client/messages/en/runs.json` — add `"cost": "COST"` to the `trace.stat`
  block (next to `duration`/`tokens`/`findings`).
- Find and edit whichever `client/messages/en/*.json` file backs the PR-list
  column headers (`status`/`updated` labels) — add a matching `cost` key
  there, same casing convention as its siblings.

### 3. Server — thread cost through run + review persistence
- `server/src/modules/reviews/run-executor.ts`:
  - destructure `costUsd` alongside `tokensIn, tokensOut, grounding` from
    `outcome` (~line 213)
  - pass it into `insertReview()` (~line 218) and the success-path
    `completeAgentRun()` (~line 243)
  - add `cost_usd: costUsd` to the success-path `RunTrace.stats` object
    (~line 264-270)
  - pass `costUsd: null` explicitly in both failure paths — `failAll`
    (~line 78) and the `catch` block (~line 298) — and in
    `traceFromBuffer`'s `stats` (~line 424). These paths often never got an
    `outcome` (the LLM call may not have returned), so cost is unknown, not
    zero.
- `server/src/modules/reviews/repository/run.repo.ts` — add `costUsd` to
  `completeAgentRun`'s `values` param + `.set()`; add
  `cost_usd: run.costUsd` to `listRunsForPull`'s row mapping.
- `server/src/modules/reviews/repository/review.repo.ts` — add `costUsd` to
  `insertReview`'s `values` param + `.values()`.
- `server/src/modules/reviews/repository.ts` (the `ReviewRepository` wrapper)
  — mirror both signature changes.
- `server/src/modules/reviews/helpers.ts` — add `cost_usd: review.costUsd` to
  `reviewToDto()`'s return object and the `ReviewDto` interface.

### 4. Server — PR-list cost aggregation
`server/src/modules/pulls/routes.ts`, inside `GET /repos/:id/pulls`: add a
second read-time aggregation map right alongside the existing
`latestReviewByPr` block (~lines 114-130), same "list is small, IN-query + JS
grouping" idiom, querying `agent_runs` (which has its own `prId` FK — no need
to go through `reviews`):

```ts
const costByPr = new Map<string, number>();
if (prIds.length > 0) {
  const costRows = await container.db
    .select({ prId: t.agentRuns.prId, costUsd: t.agentRuns.costUsd })
    .from(t.agentRuns)
    .where(inArray(t.agentRuns.prId, prIds));
  for (const run of costRows) {
    if (!run.prId || run.costUsd == null) continue;
    costByPr.set(run.prId, (costByPr.get(run.prId) ?? 0) + run.costUsd);
  }
}
```
Then `cost_usd: costByPr.get(r.id) ?? null` in the row-mapping return. Don't
reach for Drizzle's `sum()`/`.groupBy()` — there's no precedent for it
anywhere in `server/src/modules`, and it types as `string | null` even over a
`double precision` column, forcing an awkward coercion for no real benefit at
this list size.

### 5. Client — shared formatter
Create `client/src/lib/format.ts` (no general formatting module exists yet):
```ts
/** Format a USD review cost. "—" = unknown (null/unpriced model or run never
 * completed), "Free" = a known-zero-cost model, "<$0.001" = nonzero but too
 * small to show at 3dp (avoids reading as free), else "$X.XXX". */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "—";
  if (usd === 0) return "Free";
  if (usd < 0.001) return "<$0.001";
  return `$${usd.toFixed(3)}`;
}
```
Use the em dash `—` (U+2014) for the null case — the codebase's existing
convention (`PRRow.tsx`, `TraceBody.tsx`), not a hyphen. Don't move
`formatSeconds`/`formatTokens` out of `RunTraceDrawer/helpers.ts` — they stay
local to that component tree; only `formatCost` is genuinely shared across
three unrelated component trees.

### 6. Client Screen C — trace drawer (simplest, do first)
`.../RunTraceDrawer/_components/TraceBody/TraceBody.tsx` — import
`formatCost` from `@/lib/format`; insert
`<Stat label={t("trace.stat.cost")} val={formatCost(stats.cost_usd)} />`
between the TOKENS and FINDINGS `<Stat>`s (~line 65-66).

### 7. Client Screen B — Agent runs tab
- `.../RunHistory/RunHistory.tsx` — import `formatCost`; add a cost `<span>`
  inside the existing right-aligned time block (~lines 198-200, next to
  `{r.ran_at && <span>...</span>}`), fed by `r.cost_usd`. Gate on `settled`
  the same way the rest of that row already gates on run completion. No
  tokens display — cost only, per the confirmed scope.
- `.../ReviewRunAccordion/ReviewRunAccordion.tsx` — import `formatCost`;
  insert a cost `<span>` between the score `<Badge>` (~lines 101-105) and the
  `formatWhen(review.created_at)` timestamp (~lines 106-108), fed by
  `review.cost_usd`.

### 8. Client Screen A — Pull Requests list column
- `.../pulls/constants.ts` — insert `"cost"` into `COLUMN_KEYS` between
  `"status"` and `"updated"`; insert a 7th track into `GRID` between the
  status (118px) and updated (78px) tracks, e.g.
  `"1fr 132px 92px 60px 118px 72px 78px"`.
- `.../pulls/styles.ts` — add a `costCell` style, pattern-matched on the
  existing `updatedCell`/`scoreCell` styles. (`s.headCell`'s right-align only
  applies to the *last* column, so `cost` — now second-to-last — needs no
  special alignment handling.)
- `.../pulls/_components/PRRow/PRRow.tsx` — import `formatCost`; insert a
  cost cell between the status `<Badge>` div (~lines 56-60) and the
  `updatedCell` div (~line 61), rendering `formatCost(pr.cost_usd)` directly
  — no branching needed, `formatCost` already returns "—" for null.

### 9. Tests

**Client — new coverage for the cost display itself, not just fixture upkeep:**
- `client/src/lib/format.test.ts` (new) — unit-test all four `formatCost`
  branches: `null`/`undefined` → `—`; `0` → `Free`; `0.0004` → `<$0.001`;
  `0.014` → `$0.014`.
- `RunTraceDrawer.test.tsx` — add `cost_usd` to the `TRACE.stats` literal
  (~line 10) **and** extend the existing render assertions to check the COST
  stat's label + value actually appear.
- `RunHistory.test.tsx` — add `cost_usd` to the `run(o: Partial<RunSummary>)`
  factory (~lines 25-31) **and** assert a run row renders its formatted cost
  next to the time.
- `ReviewRunAccordion.test.tsx` (new — no test file exists for this
  component today) — one happy-path case (cost renders between the score
  badge and the timestamp) + one null case (`cost_usd: null` → `—`).
- `PRRow.test.tsx` (new — no test file exists for the PR list today) — one
  happy-path case (COST column renders a summed value) + one null case (a PR
  with zero runs → `—`).

**Server:**
- `server/test/reviews.it.test.ts` — this integration suite already drives
  full review flows against `MockLLMProvider`, which **already returns
  `costUsd: 0.001` per call** (`server/src/adapters/mocks.ts:85,101` —
  nothing to change there). Extend the existing `'runs a review:
  map-reduce...'` test to assert the persisted review/run carries the
  expected `cost_usd` (summed across map-reduce chunks — e.g. 2 chunks →
  `0.002`), and extend/add an assertion that `GET /repos/:id/pulls` returns
  the correctly-summed `cost_usd` for that PR. Reuses this suite's existing
  DB setup rather than adding a new file.
- `server/test/reviews-helpers.test.ts` — currently only tests `taskLine`;
  add a `describe('reviewToDto', …)` block asserting `cost_usd` passes
  through correctly, including the `null` case.

This follows the repo's own "typological, not exhaustive" testing
philosophy (`TESTING.md`): one happy path + the edge that actually matters
per layer, extending existing suites where one already exercises the right
setup, and adding new files only where a component/route currently has zero
coverage.

## Verification

- `cd server && pnpm typecheck && pnpm test` (unit; run `.it.test` suite too
  if Docker is available) — confirms contracts, repository signatures, and
  the aggregation query compile and pass.
- `cd reviewer-core && npm run typecheck` — untouched by this feature, but
  confirm `ReviewOutcome.costUsd` still flows through unchanged.
- `cd client && pnpm typecheck && pnpm test` — confirms the two updated
  fixtures and all touched components compile.
- Manual pass via `./scripts/dev.sh`: run a review (any agent/provider) on
  the seeded PR, then check —
  1. PR list shows a COST value for that PR (sum, 3 decimals) — reload to
     confirm it's read from the DB, not just optimistic client state.
  2. PR detail → Agent runs tab: the new run's TIMELINE row shows a cost
     next to its time; its REVIEW RUNS card shows cost next to the score.
  3. Open that run's trace drawer: COST stat appears between TOKENS and
     FINDINGS, matching the same dollar figure.
  4. A PR with zero runs still shows "—" in the list (no crash on the
     empty/null path).
