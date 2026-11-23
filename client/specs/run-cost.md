# Run Cost — client

Show the USD cost (and tokens) of review runs on three screens. Server side
(persistence + API fields): [`server/specs/run-cost.md`](../../server/specs/run-cost.md).

## Screens
1. **PR list** (`/repos/:repoId/pulls`) — new **COST** column (compact, e.g. `$0.014`)
   showing the **total** cost of all agent runs on the PR (`PrMeta.cost_usd`).
2. **PR Detail → Agent runs timeline** — under the run time: `9 119 tok · $0.0013`
   (`RunSummary.tokens_in/out/cost_usd`).
3. **Run trace drawer → Stats** — 4th tile **COST** next to Duration / Tokens / Findings
   (`RunTrace.stats.cost_usd`).

## Acceptance criteria
- **C1.** The PR list has a COST column between STATUS and UPDATED. `cost_usd == null` → `—`.
- **C2.** The timeline shows `<tokens> tok · <cost>` for `done` runs only. Failed,
  cancelled and running runs show no line. Null cost → `—`.
- **C3.** The trace drawer Stats has a COST tile. Old traces without `cost_usd` → `—`.
- **C4.** A real `0` (free model) is data: render `$0.0000`, not `—`.
- **C5.** No run without data ever renders `$0.00`.

## Formatting (one rule everywhere)
`formatCost(usd: number | null | undefined): string`
- `null` / `undefined` → `—`
- `< 0.01` → 4 decimals (`$0.0013`)
- `< 1` → 3 decimals (`$0.014`)
- otherwise → 2 decimals (`$1.50`)

Timeline tokens = `tokens_in + tokens_out`, formatted with `toLocaleString()`.

## Implementation plan
1. **Contracts** — make the same `cost_usd` additions as the server in
   `src/vendor/shared/contracts/` (`trace.ts`: `RunSummary`, `RunStats`; `platform.ts`:
   `PrMeta`). Both vendored copies must match.
2. **`RunCostBadge`** — `src/components/run-cost-badge/` (`RunCostBadge.tsx`, `index.ts`).
   Exports `formatCost` and `<RunCostBadge cost tokensIn? tokensOut? />` with two variants:
   - compact (no tokens) → cost only — PR list;
   - full (tokens passed) → `N tok · $X` — timeline.
3. **PR list**
   - `app/repos/[repoId]/pulls/constants.ts`: add `"cost"` to `COLUMN_KEYS` before
     `"updated"`; add a `78px` column to `GRID` at the same position.
   - `_components/PRRow/PRRow.tsx`: add a cell with `<RunCostBadge cost={pr.cost_usd} />`
     (mono, muted).
   - `messages/en/prReview.json`: `list.columns.cost = "COST"`.
4. **Timeline** — `pulls/[number]/_components/RunHistory/RunHistory.tsx`: in the right
   column under `ran_at`, when `settled`, render
   `<RunCostBadge cost={r.cost_usd} tokensIn={r.tokens_in} tokensOut={r.tokens_out} />`.
5. **Trace drawer** — `RunTraceDrawer/_components/TraceBody/TraceBody.tsx`: add
   `<Stat label={t("trace.stat.cost")} val={formatCost(stats.cost_usd)} />` after Tokens;
   `messages/en/runs.json`: `trace.stat.cost = "COST"`. Check that `s.statsRow` lays out
   4 equal tiles.
6. **Tests**
   - `formatCost`: `null`, `undefined`, `0`, `0.0013`, `0.014`, `1.5`.
   - `RunHistory.test.tsx`: badge shown for a `done` run, absent for `failed`.
   - `RunTraceDrawer.test.tsx`: COST tile renders; `—` when `stats.cost_usd` is missing.

## Verification
- `pnpm test`.
- `./scripts/dev.sh`, run a review → all 3 screens show cost; an old run shows `—`.
- `./scripts/e2e.sh` — the mock LLM cost `0.001` → `$0.0010` on all 3 screens.

## Out of scope
Cost in the Review Runs verdict plate, backfill of old runs.
