# Run cost tracking (L01)

Status: implementing.

## Context

`reviewer-core`'s `reviewPullRequest()` already computes `ReviewOutcome.costUsd`
(summed across every LLM call in a run, sourced from OpenRouter's reported
`usage.cost`), but the server drops it — `run-executor.ts` never persists or
surfaces it. This spec adds cost end-to-end to three screens:

1. **Pull Requests list** — a new Cost column, summed across every run ever
   made on that PR (all agents, all time — a "total spend" figure, not just the
   latest review round).
2. **PR detail → Agent runs tab** — cost shown next to the timestamp in both the
   Timeline (`RunHistory`) and Review Runs (`ReviewRunAccordion`) sections.
3. **Run trace drawer → Stats** — a Cost tile alongside Duration / Tokens /
   Findings.

Cost data is sourced from **OpenRouter only** for now (the only provider that
returns a real per-call cost). No static price-table fallback is added for
OpenAI/Anthropic in this pass.

## Decisions

1. **PR-list cost = `SUM(agent_runs.cost_usd)` grouped by `prId`**, not the
   latest-review-only pattern the Score column uses — multiple agents can
   review one PR, and we want total spend, not one agent's last number.
2. **Failed/cancelled runs get `cost_usd: 0`**, matching the existing
   `tokensIn: 0, tokensOut: 0` zeroing on the failure path (`run-executor.ts`'s
   catch block never has partial per-chunk state to report — a pre-existing
   limitation this feature doesn't change).
3. **Null cost** (no price data for the model) renders as `—`, same convention
   as PrMeta's existing `score: null` handling. No estimate is substituted.
4. **Shared zod fields are `.nullish()`, not `.nullable()`** — required to keep
   `server/test/contracts.test.ts`'s `RunTrace.parse()` fixture and
   `client/.../RunTraceDrawer.test.tsx`'s `TRACE` fixture (both omit
   `cost_usd`) passing/type-checking unmodified, and to gracefully read old
   `run_traces` JSONB rows persisted before this column existed.

## Data model

`agent_runs.cost_usd double precision` (nullable) — new column, mirrors the
`costUsd: doublePrecision('cost_usd')` pattern already used in
`server/src/db/schema/eval.ts`. Migration via `pnpm db:generate` (never
hand-authored).

`reviews` table is **not** touched — cost stays owned by `agent_runs`; the
Review Runs UI cross-references it via `reviews.run_id`.

## Shared contracts (`@devdigest/shared`, vendored in both `server/src/vendor/shared`
and `client/src/vendor/shared` — edited identically in both, no sync tooling exists)

- `contracts/trace.ts`: `RunStats.cost_usd` and `RunSummary.cost_usd` →
  `z.number().nullish()`.
- `contracts/platform.ts`: `PrMeta.cost_usd` → `z.number().nullish()`.

## Backend changes

- `server/src/db/schema/runs.ts` — add the column.
- `server/src/modules/reviews/run-executor.ts` — stop dropping `costUsd` from
  the destructured `outcome`; pass it into `completeAgentRun()` and into
  `RunTrace.stats.cost_usd`; zero it in the failure/`traceFromBuffer` paths.
- `server/src/modules/reviews/repository/run.repo.ts` — `completeAgentRun()`
  writes `cost_usd`; `listRunsForPull()` maps it into `RunSummary`.
- `server/src/modules/pulls/routes.ts` — new grouped `SUM(agent_runs.cost_usd)`
  query (alongside the existing `latestReviewByPr` score query), mapped into
  each returned PR as `cost_usd`.

## Frontend changes

- `client/src/app/repos/[repoId]/pulls/{constants,styles}.ts` +
  `_components/PRRow/PRRow.tsx` — new Cost column between Status and Updated.
- `_components/FindingsTab/FindingsTab.tsx` — builds a `runId → cost_usd` map
  from `prRuns` and passes it into each `ReviewRunAccordion`.
- `_components/RunHistory/RunHistory.tsx` — cost next to the run timestamp.
- `_components/ReviewRunAccordion/ReviewRunAccordion.tsx` — new `cost` prop,
  rendered between the score badge and the timestamp.
- `_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx` — 4th Stat
  tile.
- `_components/RunTraceDrawer/helpers.ts` — new `formatUsd(cost)` helper
  (handles `null`/`undefined` → `—`), reused by all of the above instead of
  duplicating formatting logic.
- `client/messages/en/prReview.json` (`list.columns.cost`) and
  `client/messages/en/runs.json` (`stat.cost`) — new i18n keys.

## Out of scope

- The mockups' `FINDINGS` column on the PR list — doesn't exist in the current
  codebase at all (unrelated pre-existing gap).
- OpenAI/Anthropic real-cost sourcing — both currently use a static price
  table (`server/src/adapters/llm/pricing.ts`); no change here.
- Partial-cost recovery on a mid-run failure — matches existing token
  behavior, not newly introduced or fixed by this feature.

## Testing strategy

See implementation PR / commit for the concrete test additions. Summary:

- **server-unit**: `contracts.test.ts` needs no edit (nullish fields keep
  existing fixtures valid); `price-book.test.ts` unaffected.
- **server-integration** (`*.it.test.ts`, needs Docker):
  - `reviews.it.test.ts` — extend the map-reduce/grounding test with
    `agent_runs.cost_usd` + `trace.stats.cost_usd` assertions using
    `MockLLMProvider`'s fixed `costUsd: 0.001`; add a multi-agent case; add a
    failed-run case asserting `cost_usd === 0`.
  - `integration.it.test.ts` — new coverage for the PR-list `SUM(...) GROUP BY
    prId` query (no existing test touches this route's aggregation today).
- **client**: extend `RunTraceDrawer.test.tsx` and `RunHistory.test.tsx`
  fixtures; add net-new `PRRow.test.tsx` and `ReviewRunAccordion.test.tsx`
  (neither exists today) covering the cost display + `—` fallback.
- **Manual**: run a real review against PR #482 via a live OpenRouter key and
  confirm cost renders on all three screens — the only step that exercises the
  actual `usage.cost` path, since every automated test above uses the mock.
