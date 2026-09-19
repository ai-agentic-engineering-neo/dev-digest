# Spec: PR-list cost and findings summary

## Summary

The `GET /repos/:id/pulls` endpoint returns a summary for each pull request, including three computed fields from previous reviews: `score` (latest review quality 0–100), `cost_usd` (total LLM spend across all review runs), and `findings_counts` (per-severity breakdown from each agent's most recent review). These fields enable users to assess which PRs need attention, how much reviewing has cost in USD, and what types of issues (security vs. style vs. performance) were found. The computation happens on read (no denormalization) by querying reviews and agent_runs tables, then reducing in JavaScript to avoid N+1 joins and expensive grouping in SQL. This design keeps the PR table lean while supporting cheap list operations.

## API contract

**Endpoint:** `GET /repos/:id/pulls`  
**Response:** Array of `PrMeta` objects  
**Relevant fields** (see `src/vendor/shared/contracts/platform.ts:157–188`):

```typescript
export const PrMeta = z.object({
  // ... PR metadata (number, title, author, branch, status, diff stats)
  
  // Latest review's quality score (0–100); null until reviewed
  score: z.number().int().nullish(),
  
  // Total cost in USD; sums every status='done' run's costUsd for the PR
  // (not just the newest batch; cumulative spend). Null when unpriced.
  cost_usd: z.number().nullish(),
  
  // Severity breakdown from each agent's latest review only.
  // Mirrors the score field: a re-run replaces that agent's prior
  // findings, not adds. Absent until reviewed; omits severities with zero.
  findings_counts: z.object({
    CRITICAL: z.number().int().optional(),
    WARNING: z.number().int().optional(),
    SUGGESTION: z.number().int().optional(),
  }).nullish(),
});
```

## Acceptance criteria

1. **Cost is cumulative, not latest-batch only**
   - `cost_usd` sums **every** `status='done'` run in the `agent_runs` table for the PR, regardless of batch or recency.
   - A re-run's cost adds to the total; cost represents cumulative LLM spend, not a snapshot.
   - Implementation: `src/modules/pulls/total-cost.ts:11–26` iterates all done runs and sums `costUsd`.
   - Edge case: A run with `costUsd = null` is skipped; if all runs are unpriced, the PR's `cost_usd` is `null` (distinguishes "free review" from "unpriced review").
   - ✓ Unit test: `server/test/total-cost.test.ts:20–26` — "sums across multiple batches / re-runs, not just the newest" validates two runs (0.01 + 0.02) sum to 0.03.
   - ✓ Unit test: `server/test/total-cost.test.ts:37–43` — "mixes known and unknown, summing only the known" skips null costs.

2. **Findings count only the latest review per agent**
   - When one agent re-runs a review on the same PR, the second review fully replaces the first in the findings tally.
   - Only findings from the latest review per agent are counted, generalizing the score field's "latest review wins" rule.
   - Implementation: `src/modules/pulls/findings-counts.ts:22–53` groups by `(prId, agentId)` and selects first-seen `reviewId`.
   - A review with `agentId = null` (legacy) is treated as its own independent group.
   - ✓ Unit test: `server/test/findings-counts.test.ts:31–38` — "ignores an older review from an agent once a newer one from that agent is seen" skips stale findings.
   - ✓ Unit test: `server/test/findings-counts.test.ts:23–29` — "sums across different agents (each agent contributes its latest review)" tallies independent contributions.

3. **Counting is pure JS, no LLM call**
   - The reduction happens in JavaScript over already-fetched rows from `findings ⋈ reviews` join, pre-ordered by `reviews.createdAt DESC`.
   - No additional database queries, no external API calls, no LLM invocation.
   - Reuses the `rollupSeverities()` helper from `status.ts:23–31` to avoid re-implementing severity tallying.
   - ✓ Unit test: `server/test/findings-counts.test.ts:1–60` — all test cases are pure in-memory reductions with no mocks or DB.

4. **Both criteria hold end-to-end in the list endpoint**
   - `GET /repos/:id/pulls` composes both behaviors correctly: cost accumulates, findings tally latest-per-agent, and both are returned in one `PrMeta`.
   - Implementation: `src/modules/pulls/routes.ts:134–178` performs three parallel reduce-on-read queries and JS reductions.
   - ✓ Integration test: `server/test/reviews.it.test.ts:318–350` — "list endpoint: findings_counts breaks down by severity from each agent's latest review; cost_usd sums every done run" validates two runs from one agent: findings_counts = 1 CRITICAL (latest only), cost_usd ≈ 0.002 (sum of both).

## Implementation notes

- **Query strategy:** The endpoint fetches reviews and agent_runs with simple WHERE-IN clauses ordered by recency, then reduces in-memory. The list is small (tens of PRs), so this beats denormalization or complex SQL aggregations (N+1 risk, index strain).
- **Reuse:** `findingsCountsByPr` reuses the `rollupSeverities` helper from `status.ts` (see `docs/README.md` for the reuse pattern) rather than re-implementing the CRITICAL/WARNING/SUGGESTION tally.
- **Response shape:** See `src/vendor/shared/contracts/platform.ts:157–188` for the Zod definition; this schema is duplicated into `client/src/vendor/shared/contracts/` and must be kept in sync by hand (not a workspace symlink).

## Non-goals

- **Cost per severity** — `cost_usd` is PR-wide, not broken down by finding severity (CRITICAL costs more than SUGGESTION, etc.).
- **Paginated findings** — `findings_counts` is a summary (three numbers). Full findings detail lives on the PR detail page, not the list.
- **Historical cost tracking** — No API to fetch costs for a specific date range or per batch. Cost is always cumulative across all time.
- **Findings from dismissed/accepted findings** — Counts include all findings in the latest review regardless of user action (accept/dismiss state is tracked but does not filter the tally).
- **Cost per agent** — The endpoint does not break down `cost_usd` by which agent ran which review; cost is PR-wide.
