# Run Cost Badge

**Status:** agreed

## Problem

Every review run spends money on an LLM call, but the studio never shows how
much. The engine already knows: `reviewPullRequest` returns `costUsd` (OpenRouter's
real `usage.cost`, else tokens × the `PriceBook` price). The server drops it at
`src/modules/reviews/run-executor.ts`, and `agent_runs` has no column for it
(migration `0009` removed the old one).

Goal: persist the cost of each run and show cost + tokens in the UI — with **zero
extra model calls**.

## Scope

- `agent_runs.cost_usd` — new column, written when a run completes.
- `src/modules/reviews` — persist `outcome.costUsd`; expose it on the run list,
  the run trace and the review list.
- `src/modules/pulls` — expose the latest review's cost on the PR list.
- `reviewer-core` — no change; it already returns `costUsd`.
- Client (see [`client/specs/01-run-cost-badge.md`](../../client/specs/01-run-cost-badge.md)):
  one shared `RunCostBadge` in two variants, shown in four places.

| Where | Shows |
| ----- | ----- |
| PR list — new `COST` column | cost of the latest review (the one behind `SCORE`): `$0.014`, `—` if none |
| PR detail → Agent runs timeline, under the run time | `$0.0013 · 8.2K→1.3K` for `done` runs only |
| Agent run drawer → Stats | a `COST` tile between Tokens and Findings |
| PR detail → Review runs, accordion header | `$0.0013 · 8.2K→1.3K` |

## API / Data

**Column.** `agent_runs.cost_usd double precision NULL` — USD for one run.
`NULL` = unknown: a run from before this change, a model with no price, or a
failed/cancelled run. `doublePrecision` matches `ci_runs.cost_usd` and
`eval_runs.cost_usd`. Generated with `pnpm db:generate`.

**Trace.** `run_traces.trace.stats.cost_usd` — duplicated like `tokens_in/out`
already are.

**Contracts** (`src/vendor/shared/`, then the same lines in
`client/src/vendor/shared/`):

| Contract | Field |
| -------- | ----- |
| `RunStats` (`contracts/trace.ts`) | `cost_usd: number \| null \| undefined` — nullish: old trace documents lack it |
| `RunSummary` (`contracts/trace.ts`) | `cost_usd: number \| null` |
| `PrMeta` (`contracts/platform.ts`) | `cost_usd: number \| null \| undefined` — latest-review cost, list endpoint only |
| `ReviewRecord` (`contracts/review-api.ts`) | `cost_usd`, `tokens_in`, `tokens_out` — nullish, from the run that produced the review |

**Routes** — no new ones; these responses gain fields:

| Route | New field |
| ----- | --------- |
| `GET /repos/:id/pulls` | `cost_usd` of the latest `kind='review'` review, via `reviews.run_id → agent_runs` |
| `GET /pulls/:id/runs` | `cost_usd` per run |
| `GET /runs/:id/trace` | `stats.cost_usd` |
| `GET /pulls/:id/reviews` | `cost_usd`, `tokens_in`, `tokens_out` per review |

**Display format** (client, one helper everywhere):

| Value | Shown |
| ----- | ----- |
| `null` / missing | `—` |
| `0` | `$0.00` (a free model: the data exists) |
| `≥ 1` | `$1.23` |
| `≥ 0.01` | `$0.014` |
| `< 0.01` | two significant digits: `$0.0013` |
| tokens | `950`, `8.2K`, `1.2M`; a pair is `8.2K→1.3K` |

## Acceptance criteria

1. Every `done` run stores `cost_usd` from `outcome.costUsd`; no extra LLM call.
2. A failed or cancelled run stores `NULL`; the UI shows `—` or nothing, never `$0.00`.
3. The PR list's `COST` is the cost of the same review whose `SCORE` it shows; a
   PR with no review shows `—`.
4. Runs and reviews created before the migration show `—`.
5. A zero-priced model shows `$0.00`.
6. Tests: the DB-backed review flow asserts the cost on the row, the trace and all
   four routes; the contract test parses a trace with and without `stats.cost_usd`;
   client tests cover the formatter and each of the four places.

## Amendment (2026-09-23) — HW1 grading criteria

Supersedes the rows above where they disagree; the text above stays as the
original agreement.

- **Timeline, every run** (was: `done` runs only). Each run row shows its
  `RunCostBadge`; a run with no cost yet (running, failed, cancelled) reads `—`,
  never `$0.00`. Test: `RunHistory.test.tsx` ("a failed run reads '—'…",
  "a running or cancelled run reads '—' too").
