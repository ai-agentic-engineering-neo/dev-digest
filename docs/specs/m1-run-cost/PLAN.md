# M1 · Run cost — implementation plan

Spec: [SPEC.md](SPEC.md). The order is server first (DB → contracts → write
path → read paths), then client. Each task ends with its package's typecheck
and tests passing.

Before starting, read `server/CLAUDE.md`, `client/CLAUDE.md` and both
`INSIGHTS.md`. The server `INSIGHTS.md` has a 2026-11-21 entry recommending
compute-on-read. This plan replaces it with storing the cost, so append a
`> **Superseded …**` note under that entry (append-only, never delete it).

## Task 1 — DB column + migration (server)

- `server/src/db/schema/runs.ts`: add `costUsd: doublePrecision('cost_usd')`
  to `agentRuns` (nullable, no default).
- `pnpm db:generate` → new `0010_*.sql` (`ALTER TABLE agent_runs ADD COLUMN
  cost_usd double precision`). Do not edit `0000–0009`.
- `pnpm db:migrate` locally.

## Task 2 — Contracts (server + client copies)

- `contracts/trace.ts`:
  - `RunSummary.cost_usd: z.number().nullable()`
  - `RunStats.cost_usd: z.number().nullish()`
- `contracts/platform.ts`: `PrMeta.cost_usd: z.number().nullish()`
- `contracts/review-api.ts`: `ReviewRecord.cost_usd`, `.tokens_in` and
  `.tokens_out`, each `z.number().nullish()`
- Make the same edits in `client/src/vendor/shared/contracts/*`. The copies
  already differ in comments, so edit the fields and leave the comments alone.
- Check: `pnpm typecheck` in `server` and `client`, and `npm run typecheck` in
  `reviewer-core` (it compiles against the server copy).

## Task 3 — Write path: persist cost at run completion (server)

- `repository/run.repo.ts` → `completeAgentRun(values)`: add
  `costUsd?: number | null` and `.set({ costUsd: values.costUsd ?? null })`.
  Do the same in the `ReviewsRepository.completeAgentRun` wrapper.
- `run-executor.ts`:
  - On success: destructure `costUsd` from `outcome` and pass it to
    `completeAgentRun`. Also set it in `trace.stats.cost_usd`.
  - `failAll` and the `catch` branch pass `costUsd: null` explicitly.
- No change in `reviewer-core`: `costUsd` is already returned, and the run
  makes no new LLM calls.
- Unit test (hermetic, mocks from `src/adapters/mocks.ts`, which return
  `costUsd: 0.001`): a completed run stores `cost_usd = 0.001` and the trace
  stats contain it. A failed run stores `null`.

## Task 4 — Read paths (server)

1. **`GET /pulls/:id/runs`**: `listRunsForPull` maps
   `cost_usd: run.costUsd ?? null`.
2. **`GET /runs/:id/trace`**: `service.getRunTrace` loads the trace and the
   `agent_runs` row, then sets
   `stats.cost_usd = run.costUsd ?? trace.stats.cost_usd ?? null`.
   This only changes the response; the stored jsonb isn't rewritten.
3. **`GET /repos/:id/pulls`** (`modules/pulls/routes.ts`): next to the
   existing latest-score `inArray` query, add one aggregate query for the
   whole page:
   `select pr_id, sum(cost_usd) from agent_runs where pr_id in (…) and
   workspace_id = ? group by pr_id`. In SQL, `sum` skips nulls and returns
   `null` when every row is null, which matches the spec. Map the result to
   `cost_usd`. Avoid N+1 queries.
4. **Reviews of a PR** (`reviewsForPull` → `reviewToDto`): left join
   `agent_runs` on `reviews.run_id`, select `costUsd / tokensIn / tokensOut`,
   and pass them into the DTO.

Tests:
- **Unit**: route tests for `/runs` and `/trace` through mocks, including an
  old trace with no `cost_usd` in its stats and a null DB value → `null`.
- **Integration** `test/pulls-cost.it.test.ts` (real Postgres; the
  `*.it.test.ts` naming is mandatory):
  - PR A has 3 runs: `0.001`, `0.002` and `null` → `0.003`;
  - PR B has runs, all with `null` cost → `null`;
  - PR C has no runs → `null`;
  - a run in another workspace is not counted.

## Task 5 — Client format helpers + RunCostBadge

- `client/src/lib/format.ts` (new):
  - `formatUsd(v)` following the SPEC §5.1 table;
  - `formatUsdExact(v)` for the tooltip;
  - `formatTokenCount(n)` → `9,119`;
  - move `formatTokens` here from `RunTraceDrawer/helpers.ts` and re-export it
    there, so existing imports keep working.
  - `format.test.ts`: one case per row of the format table, plus `null`, `0`
    and `<$0.0001`.
- `client/src/components/run-cost-badge/RunCostBadge.tsx` (+ `index.ts`; the
  folder is kebab-case like the other `src/components/*`): the variants
  `compact | detailed`, mono, with the tooltip. It emits no words (only `$`,
  digits, `—`), so it needs no i18n namespace.
  - `RunCostBadge.test.tsx`: compact `$0.014`; detailed `$0.014 · 8k→1.3k`;
    `null` → `—`; detailed with `null` cost but known tokens.
- i18n `messages/en`:
  - `prReview.json`: `list.columns.cost`, `timeline.tokens` (`{count} tok`;
    `RunHistory` reads the `prReview` namespace);
  - `runs.json`: `trace.stat.cost`.

## Task 6 — S1 PR list column

- `pulls/constants.ts`: in `GRID`, add an `80px` track between Status
  (`118px`) and Updated (`78px`). In `COLUMN_KEYS`, add `"cost"` between
  `"status"` and `"updated"`.
- `PRRow.tsx`: a new cell before `updatedCell` with
  `<RunCostBadge costUsd={pr.cost_usd} />`, right-aligned.
- New `PRRow/PRRow.test.tsx` (the folder has no test yet, and the client
  convention requires one): `cost_usd: 0.014` → `$0.014`; `null` → `—`.

## Task 7 — S2 timeline row

- `RunHistory.tsx`, right meta column (`ran_at` block): when
  `r.status === "done"`, add a second line:
  `t("timeline.tokens", { count: formatTokenCount(in + out) })` ·
  `<RunCostBadge costUsd={r.cost_usd} />`.
- `RunHistory.test.tsx`: add `cost_usd` to the fixtures. A done run shows
  `9,119 tok · $0.0013`. Failed and running runs show neither tokens nor cost.

## Task 8 — S3 trace drawer stat

- `TraceBody.tsx`: add
  `<Stat label={t("trace.stat.cost")} val={<RunCostBadge costUsd={stats.cost_usd} />} />`
  between TOKENS and FINDINGS. `Stat.val` in `../atoms` already accepts a
  `ReactNode`, and `statsRow` is a flex row, so the layout stays as it is.
- `RunTraceDrawer.test.tsx`: the stat renders `$0.06`. An old trace with no
  `cost_usd` renders `—`.

## Task 9 — S4 verdict banner

- `VerdictBanner.tsx`: add the optional props `costUsd`, `tokensIn` and
  `tokensOut`. Render `<RunCostBadge variant="detailed" …/>` in `titleRow`
  after the findings badge. Render nothing when all three are null.
- `ReviewRunAccordion.tsx`: pass `review.cost_usd / tokens_in / tokens_out`.
- `VerdictBanner.test.tsx`: renders with cost; hidden without data.

## Task 10 — Verification & wrap-up

- Server: unit + integration tests, typecheck. Client: `pnpm test`, typecheck.
  `reviewer-core`: typecheck.
- Manual check with `./scripts/dev.sh`: run a review on a PR with an OpenRouter
  agent.
  - S2, S3 and S4 show the same number for that run.
  - S1 equals the sum of the S2 values for the PR.
  - A pre-M1 run shows `—`.
- e2e is optional. The seed has no `agent_runs`, so a flow could only assert
  the **COST** header and `—`. Skip it unless it's cheap.
- Docs: update the API map in `server/README.md` (new response fields) and the
  UI route map in `client/README.md`, if they list fields.
- Run the `engineering-insights` wrap-up for `server` and `client`.

## Size & risk

| Task | Size | Risk |
|---|---|---|
| 1 DB | S | forgetting `db:migrate` → a runtime "column does not exist" error |
| 2 contracts | S | forgetting the client copy → parse drift |
| 3 write path | S | `costUsd` lost in the failure branches → must be explicit `null` |
| 4 read paths | M | N+1 on the PR list; workspace scoping on the aggregate |
| 5 helpers/badge | S | format edge cases (`<0.0001`, `0` vs `null`) |
| 6–9 UI | M | grid misalignment between header and rows; `Stat` prop type |
| 10 verify | S | — |
