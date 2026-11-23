# Run cost — spec & implementation plan

Status: implemented (Steps 1–6; Step 7 manual check against a live model and the e2e assertion still open) · Size: M (one migration, both vendor contract copies, 3 UI surfaces) · Packages: reviewer-core, server, client

## 1. Problem

A reviewer can't see what a review cost. Tokens are shown only in the run trace drawer; the dollar
cost of a run was removed end-to-end in `d45ab0d` ("remove per-PR/run cost, keep model pricing",
migration `0009` dropped `agent_runs.cost_usd`). The engine still computes it — `reviewPullRequest`
returns `costUsd` and the OpenRouter provider reads the real `usage.cost` — but the server throws it
away.

## 2. Goal

Show the cost (and tokens where the design asks for it) of every agent run in three places, with
**zero extra model calls**:

| # | Screen | Where | Shows |
|---|--------|-------|-------|
| S1 | PR list (`/repos/:repoId/pulls`) | new **COST** column between STATUS and UPDATED | `$0.014` — PR cost (see §4.2) |
| S2 | PR detail → Agent runs timeline (`RunHistory`) | right column of a run row, under the time | `9,119 tok · $0.0013` |
| S3 | Agent run drawer (`RunTraceDrawer` → `TraceBody`) | Stats row, 4th tile after TOKENS | `COST  $0.06` |

Out of scope: the VerdictBanner cost line from the slide, the Agent Performance / Eval cost
aggregates, backfilling old runs, budgets/alerts.

## 3. Decisions (agreed)

| Topic | Decision |
|-------|----------|
| PR aggregate (S1) | Sum over the **latest run of each agent** on the PR |
| Failed / cancelled runs | Record the cost of whatever tokens were actually consumed; a run with no usage → `—` |
| Runs created before this feature | No backfill → `—` |
| Scope | Only S1–S3 |

## 4. Behaviour

### 4.1 Cost of one run
- `cost_usd` = sum of per-LLM-call costs of the run. Per call: OpenRouter's real `usage.cost` when
  returned, else `PriceBook.estimate(model, in, out)` (live OpenRouter price → static table).
- If **any** call's cost is unknown (unknown model, no price), the run's cost is `null` (already the
  engine's rule in `run.ts`: "unknown poisons the sum") — we never show a partial number as if it were
  the whole.
- `tokens_in + tokens_out === 0` → `cost_usd = null` (no usage = no data, not `$0.00`).
- A free model with real usage (price 0) legitimately shows `$0.00`.
- Failed/cancelled run: tokens and cost of the LLM calls that **completed** before the failure are
  persisted. Tokens burned by a call that itself threw (e.g. a structured-output retry loop that
  ends in an error) are not reported by the provider and stay uncounted — documented limitation.
- Pre-work failures (`failAll`: diff load etc.) make no LLM calls → `null`.

### 4.2 Cost of a PR (S1)
- Take, per `agent_id`, the newest `agent_runs` row for the PR with `status ≠ 'running'`.
  Rows with `agent_id IS NULL` (agent deleted) are ignored.
- PR cost = sum of their non-null `cost_usd`. If none is non-null → `null` → `—`.
- Consequence (intended): if an agent's latest run failed with no usage, that agent contributes
  nothing, even if an earlier run of it had a cost.
- Deleting a run from the timeline removes it from the aggregate (next newest run of that agent
  takes over).

### 4.3 Formatting (one client helper, used by all three surfaces)
`formatCost(usd: number | null | undefined): string`
- `null`/`undefined` → `—`
- `0` → `$0.00`
- `< 0.01` → 4 decimals (`$0.0013`)
- `< 1` → 3 decimals (`$0.014`)
- `≥ 1` → 2 decimals (`$1.27`)

Timeline tokens: `tokens_in + tokens_out`, locale-grouped, suffix `tok` (`9,119 tok`). Shown only
when the run has tokens; cost part follows the `formatCost` rules. Running runs show only the time.

## 5. Acceptance criteria

- **AC1** Every completed (`done`) run whose model has a price shows a non-`—` cost in S2 and S3.
- **AC2** A run with no usage data (429 before any call, pre-work failure, legacy row) shows `—`,
  never `$0.00`, in S2/S3; it doesn't contribute to S1.
- **AC3** A run cancelled after N map-reduce chunks shows the tokens/cost of those N chunks.
- **AC4** S1 equals the sum of the latest non-running run per agent; with no cost data → `—`.
- **AC5** Deleting the latest run of an agent changes S1 accordingly after the list refetches.
- **AC6** OpenRouter runs persist the provider-reported `usage.cost`, not an estimate.
- **AC7** No additional LLM/OpenRouter calls are made to obtain cost (the PriceBook refresh is the
  existing `/models` cache, not a completion call).
- **AC8** Old traces (no `stats.cost_usd`) still parse and render — contract field is optional.
- **AC9** All new UI strings come from `messages/en/*.json`.

## 6. Design

```
reviewer-core  reviewPullRequest ──onUsage(per call)──┐   returns costUsd (already)
server         run-executor: accumulate usage ─────────┤→ completeAgentRun({..., costUsd})
                                                       │→ trace.stats.cost_usd
               agent_runs.cost_usd (double precision, nullable)  ← migration 0010
               GET /runs (RunSummary.cost_usd)   GET /pulls (PR item cost_usd, §4.2)
client         formatCost · RunCostBadge(variant: "compact" | "inline")
               PRRow (compact) · RunHistory row (inline) · TraceBody Stat tile
```

Why `onUsage` and not "return usage from the thrown error": the executor needs partial usage on
cancel/failure, and a callback keeps reviewer-core pure (no new error types; the same pattern as
`onEvent`). On success the executor uses `outcome.costUsd` (identical value) — `onUsage` is the
source of truth only on the catch path.

## 7. Implementation plan

Each step is independently testable; order matters only where noted.

### Step 1 — reviewer-core: expose per-call usage
- `src/review/run.ts`: add `onUsage?: (u: { tokensIn: number; tokensOut: number; costUsd: number | null }) => void`
  to `ReviewInput`; call it right after each `completeStructured` resolves.
- Test (`npx vitest run`): a 2-chunk map-reduce with the model stub → `onUsage` fires twice;
  a stub that throws on chunk 2 → fired once before the throw.
- Run `npm run typecheck` here **and** `pnpm typecheck` in server (CI server-unit is triggered).

### Step 2 — server: persistence (after Step 1)
- `db/schema/runs.ts`: `costUsd: doublePrecision('cost_usd')` (nullable). `pnpm db:generate` →
  migration `0010_*` (`ALTER TABLE agent_runs ADD COLUMN cost_usd double precision`). Don't
  hand-edit the snapshot.
- `repository/run.repo.ts`: `completeAgentRun` accepts `costUsd?: number | null`; `listRunsForPull`
  maps `cost_usd`.
- `run-executor.ts`:
  - success path: pass `costUsd: tokensIn + tokensOut > 0 ? outcome.costUsd : null`;
    `trace.stats.cost_usd` same value.
  - catch path: accumulate `onUsage` into a local `{ tokensIn, tokensOut, costUsd }`; persist those
    (instead of the hard-coded `0`s) and set `traceFromBuffer` stats from them.
  - `failAll`: `costUsd: null`.
- Integration test (`*.it.test.ts`, MockLLMProvider with a fixed `costUsd`): done run persists cost;
  failed-mid-run persists partial; failAll → null.

### Step 3 — contracts (both copies: `server/src/vendor/shared` and `client/src/vendor/shared`)
- `contracts/trace.ts`: `RunStats.cost_usd: z.number().nullish()` (nullish → AC8);
  `RunSummary.cost_usd: z.number().nullable()`.
- `contracts/platform.ts` (PR list item, next to `score`): `cost_usd: z.number().nullish()`.
- Update `server/test/contracts.test.ts` fixtures.

### Step 4 — server: PR list aggregate (after Step 2–3)
- `modules/pulls/routes.ts` `GET /pulls`: one extra query next to `latestReviewByPr`:
  select `prId, agentId, costUsd, status` from `agent_runs` where `prId IN (...)`,
  `agentId IS NOT NULL`, `status <> 'running'`, ordered `ranAt desc`; group in JS (first per
  `prId|agentId` wins), sum non-null. Same "small list, one IN-query" approach as the score ring.
- Unit/integration test for §4.2 incl. "latest failed run shadows earlier cost" and "all null → null".
- Update `server/README.md` "API map" with the new field.

### Step 5 — client: shared formatting + badge (parallel with Steps 2–4 once Step 3 lands)
- `formatCost` in `src/lib/format-cost.ts` (+ unit test of every §4.3 branch).
- `RunCostBadge` (shared component, `src/components/run-cost-badge/`): `variant="compact"` →
  `$0.014`; `variant="inline"` → `9,119 tok · $0.0013`. Muted mono text, primitives from
  `@devdigest/ui`, no new library.

### Step 6 — client: the three screens
- **S1** `pulls/constants.ts`: add `"cost"` to `COLUMN_KEYS` before `"updated"`, add a ~72px track to
  `GRID`; `PRRow` renders `<RunCostBadge variant="compact" value={pr.cost_usd} />`;
  `messages/en/prReview.json` → `list.columns.cost: "Cost"`.
- **S2** `RunHistory.tsx` right column: under the time render the inline badge when the run is not
  `running`.
- **S3** `TraceBody.tsx`: 4th `<Stat label={t("trace.stat.cost")} val={formatCost(stats.cost_usd)} />`;
  `messages/en/runs.json` → `trace.stat.cost: "COST"`. Check the stats row still fits the drawer width.
- Tests: extend `RunHistory.test.tsx`, `RunTraceDrawer.test.tsx` fixtures with `cost_usd`; add a PRRow
  test for `—` vs value.
- `pnpm typecheck && pnpm test` in client.

### Step 7 — verification
- `./scripts/dev.sh`, run a review on a PR with an OpenRouter agent: S1/S2/S3 show matching values;
  OpenRouter dashboard cost ≈ stored `cost_usd`.
- Cancel a map-reduce run mid-way → partial cost visible (AC3).
- Legacy runs show `—` (AC2/AC8).
- e2e (`e2e/`): add an assertion on the COST column if the hermetic seed has runs with cost —
  otherwise note it as a follow-up.

## 8. Risks & open points
- **Estimate vs real**: non-OpenRouter providers (OpenAI/Anthropic adapters) use the static
  `pricing.ts` table — approximate. Acceptable for now; no "estimated" marker in UI.
- **Uncounted tokens of a call that threw** (see §4.1) — the provider would need to surface usage on
  failure; not worth it for this feature.
- **"Latest per agent" shadowing** (§4.2) — revisit if users expect "total spent"; it's a one-line
  change in the grouping.
- `client/src/vendor/shared` already diverges from server — sync only the touched fields, don't
  re-copy whole files.
