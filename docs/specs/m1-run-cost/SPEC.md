# M1 · Run cost — specification

Roadmap: **M1 — Run cost badge** (root `README.md` §Roadmap).
Packages: `server` (DB column, contracts, API), `client` (4 places in the UI).
Plan: [PLAN.md](PLAN.md).

## 1. Problem

Every review run spends LLM tokens, but the studio shows tokens at most, never
money. Users can't answer "how much did reviewing this PR cost?" or "which
agent run was expensive?".

The engine already knows the price, and the number gets lost on the way:

- `reviewer-core/src/review/run.ts` → `reviewPullRequest()` returns `costUsd`
  for the whole run (the sum over all LLM calls, `null` if any call had no price).
- For OpenRouter, `costUsd` is the **real** generation cost from
  `usage.cost` (`reviewer-core/src/llm/openrouter.ts`). It falls back to
  `PriceBook.estimate()` only when the API doesn't return a cost. For the OpenAI
  and Anthropic adapters, it comes from the static table `server/src/adapters/llm/pricing.ts`.
- `server/src/modules/reviews/run-executor.ts` keeps only `tokensIn` /
  `tokensOut` from the outcome. `agent_runs` has no cost column, so the number
  is never stored and never reaches the UI.

## 2. Goal

Show the USD cost (and tokens, where the design shows them) of each agent run
in four places:

| # | Where | Component | Shows |
|---|---|---|---|
| S1 | PR list `/repos/:repoId/pulls` | new **COST** column in `PRRow` | **sum** of all the PR's runs, e.g. `$0.014` |
| S2 | PR page → Agent runs → timeline (`RunHistory`) | right meta column, under the start time | tokens + cost of **that run**: `9,119 tok · $0.0013` |
| S3 | Run trace drawer (`RunTraceDrawer` → `TraceBody`) | **COST** stat between TOKENS and FINDINGS | cost of **that run**: `$0.06` |
| S4 | PR page → review accordion → `VerdictBanner` | badge in the title row | cost + tokens of the review's run: `$0.014 · 8.2k→1.3k` |

S1–S3 follow the attached screenshots. S4 comes from the M1 slide ("рядок у
плашці вердикту на PR Detail").

## 3. Decisions (agreed)

| Topic | Decision |
|---|---|
| Source of the number | The `costUsd` that `reviewPullRequest()` already returns. **Zero extra model calls.** No re-pricing on read. |
| Storage | **Stored** in a new nullable column `agent_runs.cost_usd` (`double precision`), written once when the run completes. It's also written into `run_traces.trace.stats.cost_usd`. |
| No data | A run with `cost_usd = null` shows **`—`**, never `$0.00`. This covers runs from before this feature, runs on a model with no known price, and failed or cancelled runs. |
| Real zero | A real `0` (a free model, e.g. `z-ai/glm-4.7-flash`) shows `$0.00`. |
| PR total (S1) | The sum of `cost_usd` over **all** of the PR's `agent_runs` that have a non-null cost: every agent, every rerun. `null` → `—` when no run has a cost. |
| Failed / cancelled runs | Stay as they are today (`tokens = 0`) and get `cost_usd = null`. Recording what a failed run spent is out of scope. |
| UI component | One client component `RunCostBadge` with two variants: `compact` (cost only) and `detailed` (cost · tokens). |
| Docs location | `docs/specs/m1-run-cost/` at the repo root (cross-package feature). |

### Consequences (accepted)

- **History before M1 shows `—`.** There is no backfill. Old rows keep
  `cost_usd = null`.
- **The numbers are fixed.** A stored cost doesn't change when prices change
  later. For OpenRouter it is the invoiced amount, not an estimate.
- **A mixed PR total.** If some runs of a PR have a cost and some don't, S1
  shows the sum of the known ones (it's a lower bound). See §8.

## 4. Data & API changes

### 4.1 DB

`server/src/db/schema/runs.ts` → `agentRuns.costUsd: doublePrecision('cost_usd')`
(nullable). It's a new migration generated with `pnpm db:generate`. Applied
migrations are never edited.

### 4.2 Contracts

Both copies must change identically: `server/src/vendor/shared` and
`client/src/vendor/shared` (root `CLAUDE.md` gotcha).

| Contract (file) | New field | Filled by |
|---|---|---|
| `RunSummary` (`contracts/trace.ts`) | `cost_usd: z.number().nullable()` | `GET /pulls/:id/runs` from `agent_runs.cost_usd` |
| `RunStats` (`contracts/trace.ts`) | `cost_usd: z.number().nullish()`. Optional because traces stored before M1 don't have it. | written at completion; `GET /runs/:id/trace` overrides it from `agent_runs.cost_usd` (source of truth) |
| `PrMeta` (`contracts/platform.ts`) | `cost_usd: z.number().nullish()`. List endpoint only. | `GET /repos/:id/pulls`: one aggregate query per page |
| `ReviewRecord` (`contracts/review-api.ts`) | `cost_usd`, `tokens_in`, `tokens_out`: all `z.number().nullish()` | `GET` reviews of a PR: left join `agent_runs` on `reviews.run_id` |

`agent_runs` stays the only source of truth. Every endpoint reads the stored
value and nothing is re-computed.

## 5. UI behaviour

### 5.1 Number format: `formatUsd(v)` (one helper for all places)

| Value | Shows |
|---|---|
| `null` / `undefined` | `—` (muted) |
| `0` | `$0.00` |
| `0 < v < 0.0001` | `<$0.0001` |
| `0.0001 ≤ v < 1` | 2 significant digits, at least 2 decimals: `$0.0013`, `$0.014`, `$0.06`, `$0.37` |
| `≥ 1` | 2 decimals, grouped: `$12.50`, `$1,204.10` |

Always monospace. Tooltip (`title`): the exact value with 6 decimals, e.g.
`$0.001284`.

### 5.2 `RunCostBadge`

```
<RunCostBadge costUsd={…} />                                  → "$0.014"
<RunCostBadge costUsd={…} tokensIn={…} tokensOut={…} variant="detailed" />
                                                              → "$0.014 · 8.2k→1.3k"
```

- `compact` (default) is used by S1 and S3.
- `detailed` is used by S4. Tokens use the existing `formatTokens` (moved to a
  shared helper).
- `costUsd == null` → `—` in both variants. In `detailed`, the tokens are still
  shown if they are known.

### 5.3 Per place

- **S1 PR list.** Column header **COST**, placed between **STATUS** and
  **UPDATED** (the order on the design). `GRID` in `pulls/constants.ts` gets
  one ~80px track, and `COLUMN_KEYS` gets `cost`. The header and rows share
  `GRID`, so they change together. A PR without a cost shows a muted `—`.
  The FINDINGS and Run Review columns from the design are **not** part of this
  feature.
- **S2 Timeline.** The right meta column becomes two lines:
  `8:52:51 PM` / `9,119 tok · $0.0013`. Tokens = `tokens_in + tokens_out`,
  grouped. Only for `status = done`. `running`, `failed` and `cancelled` runs
  show the time only (as on the design's `error` row).
- **S3 Trace drawer.** Stats order: DURATION · TOKENS · **COST** · FINDINGS.
  Value: `RunCostBadge compact` from `stats.cost_usd`; `—` for old traces.
- **S4 Verdict banner.** A badge `RunCostBadge detailed` in the title row,
  after the findings count and before the agent badge. Hidden when both the
  cost and the tokens are unknown.
- **i18n.** `prReview` gets `list.columns.cost` (`Cost`) and
  `timeline.tokens` (`{count} tok`). `runs` gets `trace.stat.cost` (`COST`).
  The tooltip is just the exact amount, so it needs no key. Only
  `messages/en` exists today. No inline UI strings.

## 6. Out of scope

Backfill of old runs · cost of failed/cancelled runs · budgets and alerts ·
per-agent / per-repo dashboards (M7/M8) · currencies other than USD · the
FINDINGS and Run Review columns in the PR list · CI runs (`source='ci'`,
already have `ci_runs.cost_usd`) · the multi-agent screen
(`AgentColumn.cost_usd` already exists).

## 7. Acceptance criteria

1. A finished run writes `agent_runs.cost_usd` equal to `outcome.costUsd`.
   It doesn't add any LLM call.
2. **S1:** the PR list has a **COST** column between STATUS and UPDATED. It
   shows the sum of the PR's run costs, or `—` when there's none.
3. **S2:** each `done` run in the timeline shows `N tok · $X` under its time.
   Failed, cancelled and running runs show only the time.
4. **S3:** the trace drawer shows **COST** between TOKENS and FINDINGS. A trace
   stored before M1 shows `—` and still renders.
5. **S4:** the verdict banner shows `$X · in→out` for its run.
6. A run with unknown cost shows `—` everywhere, never `$0.00`. A free model
   shows `$0.00`.
7. For the same run, S2, S3 and S4 show the same number. S1 equals the sum of
   the S2 values of that PR.
8. One new migration. Both contract copies are updated. Typecheck and tests
   pass in `server`, `client` and `reviewer-core`.

## 8. Open questions

- **Mixed PR total.** If some runs have a cost and some don't, should S1 mark
  the total as partial (e.g. a `~` prefix or a tooltip)? The spec assumes a
  plain sum of the known costs.
- **Token style.** S3 uses `15k→1.2k` (existing helper) and the slide shows
  `8.2K→1.3K`. The spec reuses the existing lowercase format everywhere.
