# Run Cost Badge — server

Persist the per-run LLM cost that `reviewer-core` already computes, and surface
it everywhere a run's tokens are already surfaced, so the client can render a
cost badge in three places (see [client/specs/run-cost-badge.md](../../client/specs/run-cost-badge.md))
with **zero additional model calls**.

## Current state (why this is mostly plumbing, not new computation)

`reviewPullRequest()` in `reviewer-core/src/review/run.ts` already sums
`costUsd: number | null` into its `ReviewOutcome` (line ~110), computed from
each LLM adapter's `usage` via the injected `estimateCost`/`PriceBook`. The
bug this spec fixes: `server/src/modules/reviews/run-executor.ts:213`
destructures `const { tokensIn, tokensOut, grounding } = outcome;` — `costUsd`
is silently dropped and never reaches the DB. Pricing infrastructure
(`server/src/adapters/llm/pricing.ts` static table,
`server/src/platform/price-book.ts` live OpenRouter cache) is mature and
**out of scope to change**.

## Requirements

### 1. Schema — `server/src/db/schema/runs.ts`

Add a nullable cost column to `agentRuns` (line ~8-31), alongside `tokensIn`/
`tokensOut`:

```ts
costUsd: doublePrecision('cost_usd'),
```

(`doublePrecision`, not `integer` — this is a fractional USD amount computed
by floating-point pricing math elsewhere.) Generate + apply the migration:

```bash
pnpm db:generate
pnpm db:migrate
```

per this package's own gotcha — the server does **not** migrate on boot.

No column is needed on `runTraces` — its `trace` is a single jsonb document;
the new field goes inside the existing `stats` object (see contracts below).

### 2. Persist on completion — `server/src/modules/reviews/run-executor.ts`

- Success path (`runOneAgent`, line ~213): destructure `costUsd` too —
  `const { tokensIn, tokensOut, costUsd, grounding } = outcome;` — and pass it
  through to both `completeAgentRun()` (line ~243) and the `trace.stats`
  object (line ~264) as `cost_usd: costUsd`.
- Failure/cancel paths — `failAll()` (line ~75-93), the `catch` block in
  `runOneAgent` (line ~296-310), and `traceFromBuffer()` (line ~403-432) —
  must pass `costUsd: null` explicitly (**never `0`**): a failed or cancelled
  run has no meaningful cost even though it also reports `tokensIn: 0,
  tokensOut: 0`.

### 3. Repository — `server/src/modules/reviews/repository/run.repo.ts`

- `completeAgentRun()` (line ~141-173): add `costUsd: number | null` to the
  `values` param type (**required**, not optional — forces every call site to
  decide, the same class of bug that caused this feature to be needed) and to
  the `.set({...})` call.
- `listRunsForPull()` (line ~40-68): map `cost_usd: run.costUsd` into the
  returned `RunSummary`, alongside the existing `tokens_in`/`tokens_out`.

### 4. PR list — `server/src/modules/pulls/routes.ts`

`GET /repos/:id/pulls` (line ~114-130) currently resolves each PR's **latest
review's score** with one `IN`-query against `reviews` (`kind = 'review'`,
`orderBy(desc(reviews.createdAt))`, first-seen-per-PR in JS). Extend that same
query to also resolve that same review's run cost via `reviews.run_id →
agent_runs.cost_usd` (a `leftJoin`, so score and cost always come from the
**identical** run — do not source cost from a separately-queried "latest run
by `agent_runs.ran_at`", which can diverge from "latest review" when a PR's
most recent run failed after an earlier successful review):

```ts
const reviewRows = await container.db
  .select({ prId: t.reviews.prId, score: t.reviews.score, costUsd: t.agentRuns.costUsd })
  .from(t.reviews)
  .leftJoin(t.agentRuns, eq(t.agentRuns.id, t.reviews.runId))
  .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
  .orderBy(desc(t.reviews.createdAt));
```

(Verify the exact `.select().from().leftJoin().where()` chaining against this
file's existing Drizzle usage — shown here for intent, not copy-paste.) Map
`cost_usd: review ? review.costUsd : null` into the response row next to
`score:` (line ~155).

### 5. Shared contracts — `vendor/shared` (edit **both** copies)

`server/src/vendor/shared` and `client/src/vendor/shared` are the same
contracts package, hand-kept in sync — there is no sync script or single
source of truth in this repo; edit both files identically or they silently
diverge.

- `contracts/trace.ts` — `RunStats` (line ~61-67): add
  `cost_usd: z.number().nullable()`. `RunSummary` (line ~94-113): add
  `cost_usd: z.number().nullable()`.
- `contracts/platform.ts` — `PrMeta` (line ~157-173): add
  `cost_usd: z.number().nullish()`, directly under `score`, same nullish
  pattern ("latest-review cost — list endpoint only; null/absent until
  reviewed, or when that run's cost is unknown").

### 6. `reviewer-core` — no changes

`ReviewOutcome.costUsd` is already correct. This feature only stops
discarding it downstream.

## Non-goals

- No backfill for historical runs — pre-existing `agent_runs` rows keep
  `cost_usd = null` forever (the column defaults to `null`).
- No change to how `estimateCost`/`PriceBook` computes a price, or to the
  static pricing table's contents.
- No cost row on the PR Detail verdict banner (explicitly out of scope for
  this iteration — see client spec's Non-goals).

## Acceptance criteria

- A newly completed run's `agent_runs.cost_usd` is non-null whenever the
  model's price is known, and exactly `null` (never `0`) when the model is
  unpriced, or the run failed/was cancelled.
- `GET /pulls/:id/runs` returns `cost_usd` per run.
- `GET /runs/:id/trace` returns `stats.cost_usd`.
- `GET /repos/:id/pulls` returns `cost_usd` per PR, sourced from the exact
  same run as that PR's `score`.
- Runs completed before this change keep returning `cost_usd: null` — no
  migration-time backfill, no crash on missing data.
- No new LLM/HTTP calls are introduced anywhere in this change.
