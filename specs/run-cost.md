# Spec — per-run cost & token display

Status: **implemented, all four surfaces.** (2026-09-16: PR-list column + PR-detail
verdict-panel line. 2026-09-17: PR-detail Timeline row added to scope and implemented.
2026-09-17: Agent-run trace drawer's Stats box added to scope and implemented — this was
the last item under [Out of scope](#out-of-scope); that section is now empty by design.)

## 1. What this adds

Four read-only display surfaces. The list and verdict-panel surfaces are sourced from
**the same PR's latest completed run** (the run whose score/verdict already appears there
today); the Timeline and trace-drawer surfaces each show **that one run's own** cost/tokens,
since both already render one specific run at a time.

1. **PR list — COST column.** `client/src/app/repos/[repoId]/pulls/_components/PRRow` —
   compact badge, cost only (e.g. `$0.014`).
2. **PR detail — verdict panel line.** `client/src/app/repos/[repoId]/pulls/[number]/_components/VerdictBanner` —
   full badge, cost + tokens (e.g. `$0.014 · 8.2K→1.3K`).
3. **PR detail — Timeline row.** `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory` —
   full badge (same format as #2), one per settled run row, next to its timestamp.
4. **Agent-run trace drawer — Stats box.** `client/.../RunTraceDrawer/_components/TraceBody` —
   a 4th `COST` stat tile, alongside the existing `DURATION`/`TOKENS`/`FINDINGS` tiles.

"Latest run" (for #1/#2) mirrors the existing `score` field: `PrMeta.score` is already
documented as "Latest-review score (list endpoint only)"
(`server/src/vendor/shared/contracts/platform.ts:171`) and computed that way in
`GET /repos/:id/pulls` (`server/src/modules/pulls/routes.ts:114-129`). Cost/tokens follow the
identical rule — same run, same join, no new aggregation concept. The Timeline (#3) and trace
drawer (#4) need no "latest run" concept at all — each already renders exactly one specific,
already-identified run (`RunHistory` one row per `RunSummary`; the drawer one `RunTrace` by
`runId`), so both just read `cost_usd` straight off the run/trace they already have.

## 2. Why the data isn't already there

The cost math already exists, just not wired to any of these surfaces:

- `reviewPullRequest` (the pure engine) already returns `costUsd: number | null` on its
  `ReviewOutcome` (`reviewer-core/src/review/run.ts:110,216`), summed per LLM call and
  turned `null` the moment any call in the run had an unpriced model
  (`reviewer-core/src/review/run.ts:184`).
- Every LLM adapter already computes `costUsd` per call — `estimateCost()` for OpenAI/Anthropic
  (`server/src/adapters/llm/openai.ts:84`, `anthropic.ts:85`) and live OpenRouter pricing via
  `PriceBook` with the static table as fallback for OpenRouter (`server/src/platform/price-book.ts`,
  `reviewer-core/src/llm/openrouter.ts:107`).
- `ReviewRunExecutor.runOneAgent` receives this on `outcome` but **drops it**: it destructures
  only `{ tokensIn, tokensOut, grounding }` (`server/src/modules/reviews/run-executor.ts:213`)
  and never persists `costUsd`.
- `agent_runs` has no `cost_usd` column (`server/src/db/schema/runs.ts:8-31`), so there is
  nowhere to put it even if it were kept.

Everything below plugs that one gap through to all four surfaces. **No new LLM calls, no new
pricing logic** — this is pure plumbing of a number the system already computes.

(A parallel, unrelated `cost_usd`/`total_cost_usd` already exists on the L07 multi-agent
scaffolding — `AgentColumn`, `MultiAgentRun`, `AgentStats` in
`server/src/vendor/shared/contracts/observability.ts`. That is lesson scaffolding for a
different feature (per-PR multi-agent comparison) and is untouched by this spec.)

## 3. Server changes

### 3.1 Schema

Add a nullable cost column to `agent_runs` (`server/src/db/schema/runs.ts`):

```ts
costUsd: doublePrecision('cost_usd'),
```

Generate + apply the migration (`cd server && pnpm db:generate && pnpm db:migrate` — do not
hand-edit an existing migration file; `src/db/migrations/**` is append-only).

### 3.2 Persist it

`ReviewRunExecutor.runOneAgent` (`server/src/modules/reviews/run-executor.ts:213`):

```ts
const { tokensIn, tokensOut, costUsd, grounding } = outcome;
```

and pass `costUsd` into `completeAgentRun(...)` alongside `tokensIn`/`tokensOut` (line ~243).

On every failure path (`failAll`, and the `catch` block in `runOneAgent`) pass
`costUsd: null` — **not `0`**. Those paths already force `tokensIn: 0, tokensOut: 0`
regardless of any real partial usage (a pre-existing simplification for map-reduce
cancellation, not something this spec changes); `costUsd: null` keeps that same
"no meaningful data" contract instead of implying the run cost exactly $0.

`run.repo.ts`:
- `completeAgentRun(...)` values type gains `costUsd: number | null`; the `.set({...})` call
  persists it.
- `listRunsForPull` (used by `GET /pulls/:id/runs`, i.e. `RunSummary[]`) maps
  `cost_usd: run.costUsd` — **needed** because the PR-detail change in §3.4 reads cost off
  the `RunSummary[]` the page already fetches (`usePrRuns`), not off a new join.

### 3.3 `GET /repos/:id/pulls` — latest-run cost for the list

Extend the existing "latest review" query in `server/src/modules/pulls/routes.ts:114-129`.
It currently reads only `t.reviews.{prId, score}`. Join `agent_runs` on
`reviews.runId = agent_runs.id` (left join — `runId` can be null) and also select
`agentRuns.costUsd`. Fold it into the same `latestReviewByPr` map (first row per PR wins,
since rows are newest-first), and add to the mapped response:

```ts
cost_usd: review ? review.costUsd : null,
```

### 3.4 Contracts (edit **both** vendored copies — server is the source of truth, mirror to client; see root `INSIGHTS.md` on the two copies already having drifted once)

- `PrMeta` (`server/src/vendor/shared/contracts/platform.ts:157-174` **and**
  `client/src/vendor/shared/contracts/platform.ts`): add
  `cost_usd: z.number().nullish()` next to the existing `score` field, same nullability style.
- `RunSummary` (`server/src/vendor/shared/contracts/trace.ts:93-114` **and**
  `client/.../contracts/trace.ts`): add `cost_usd: z.number().nullable()` next to
  `tokens_in`/`tokens_out`.
- `RunStats` (`server/src/vendor/shared/contracts/trace.ts:61-68` **and**
  `client/.../contracts/trace.ts`): add `cost_usd: z.number().nullable()` next to
  `tokens_in`/`tokens_out` — see §3.6 for where it's populated.

### 3.5 What is deliberately *not* touched

- `ReviewRecord` / `reviewsForPull` (`server/src/vendor/shared/contracts/review-api.ts`,
  `server/src/modules/reviews/repository/review.repo.ts`) — the PR-detail panel gets its
  cost from the already-fetched `RunSummary[]` (§4.3), so no join is added here. Keeps this
  change additive-only with no new query on the reviews path.
- `MultiAgentRun` / `AgentColumn` / `AgentStats` — separate (later-lesson) feature, already
  has its own `cost_usd`.

### 3.6 Run trace stats (§1 #4)

The single persisted `run_traces.trace` document (`RunTrace`) has its own `stats` object
(`RunStats`), separate from `agent_runs` — the trace drawer reads it via `GET /runs/:id/trace`,
not from `RunSummary`. `ReviewRunExecutor` builds this object in two places, both needing the
same `cost_usd` value already computed in §3.2:

- The success path's `trace: RunTrace = { ..., stats: { duration_ms, tokens_in, tokens_out,
  findings, grounding }, ... }` (`run-executor.ts:257-272`) — add `cost_usd: costUsd` (the
  same local `costUsd` already destructured off `outcome` in §3.2).
- `traceFromBuffer(...)` (`run-executor.ts:412-436`), used by both failure paths (`failAll`
  and the `catch` block) to persist a minimal trace — its `stats` literal currently hardcodes
  `tokens_in: 0, tokens_out: 0`; add `cost_usd: null` alongside them, consistent with §3.2's
  "no meaningful data" rule for a run that didn't complete.

## 4. Client changes

### 4.1 `RunCostBadge` (new, shared) — `client/src/components/RunCostBadge/`

Cross-route component per the client convention ("cross-route components" live in
`src/components/`, `client/CLAUDE.md`) since it's used from both the `pulls/` list tree and
the `pulls/[number]/` detail tree.

```ts
type RunCostBadgeProps =
  | { variant: "compact"; costUsd: number | null }
  | { variant: "full"; costUsd: number | null; tokensIn: number | null; tokensOut: number | null };
```

Rendering rule (both variants): **if `costUsd` is `null`, render the em dash `—`** (the same
character `PRRow` already uses for "never reviewed", `s.muted`/`—` — not a hyphen, not
`$0.00`) and nothing else. This covers every "no data" case in one place: no review yet,
an unpriced model, or a failed/cancelled run.

- `compact` → `formatCostUsd(costUsd)` alone, e.g. `$0.014`.
- `full` → `` `${formatCostUsd(costUsd)} · ${formatTokenPair(tokensIn, tokensOut)}` ``,
  e.g. `$0.014 · 8.2K→1.3K`. (If `costUsd` is non-null, tokens are always non-null too for a
  `done` run — see §5 — so this branch never needs a separate per-field dash.)

Formatting helpers (colocated `RunCostBadge/helpers.ts`):

```ts
export function formatCostUsd(costUsd: number | null): string {
  if (costUsd == null) return "—";
  if (costUsd > 0 && costUsd < 0.0005) return "<$0.001";
  return `$${costUsd.toFixed(3)}`;
}

export function formatTokenPair(tokensIn: number | null, tokensOut: number | null): string {
  if (tokensIn == null || tokensOut == null) return "—";
  const fmt = (n: number) => `${(n / 1000).toFixed(1)}K`;
  return `${fmt(tokensIn)}→${fmt(tokensOut)}`;
}
```

These constants (3-decimal cost, one-decimal uppercase-`K` tokens) are chosen to match the
attached mockups exactly (`$0.014`, `$0.041`, `$0.003`; `8.2K→1.3K`) — flag in review if a
different precision is wanted.

Note: this is a **second** token-pair formatter alongside the trace drawer's existing
`formatTokens` in `RunTraceDrawer/helpers.ts` (lowercase `k`, 0-decimal input side —
`"12k→1.5k"`). Deliberately not reused: that one is colocated to the trace drawer per the
client's "colocation over shared folders" convention, and its format doesn't match the
mockups here. Flagged as a known minor inconsistency, not a blocker.

### 4.2 PR list column

- `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx`: new cell,
  `<RunCostBadge variant="compact" costUsd={pr.cost_usd ?? null} />`, placed after the status
  cell and before the updated-at cell (matches the mockup's column order: … STATUS, COST,
  UPDATED).
- `client/src/app/repos/[repoId]/pulls/constants.ts`: add `"cost"` to `COLUMN_KEYS` in that
  position; extend `GRID` with one more column track.
- `client/src/app/repos/[repoId]/pulls/styles.ts`: add a `costCell` style if the badge needs
  its own alignment (right-aligned, monospace-ish like `scoreCell`/`updatedCell`).
- `client/messages/en/prReview.json`: add `"list.columns.cost": "Cost"`.

### 4.3 PR detail panel line

`VerdictBanner` is already rendered **once per run** — inside `ReviewRunAccordion`, one per
`ReviewRecord` (`ReviewRunAccordion.tsx:140-144`), not as a single page-level "PR brief". The
mockup's "PR BRIEF" panel is the (default-open, newest) accordion's `VerdictBanner`; no new
top-level component is needed.

- `VerdictBanner` (`client/.../VerdictBanner/VerdictBanner.tsx`): add optional props
  `costUsd?: number | null`, `tokensIn?: number | null`, `tokensOut?: number | null`; render
  `<RunCostBadge variant="full" .../>` near the score column (under/beside the "PR SCORE"
  label, matching the mockup).
- `ReviewRunAccordion.tsx`: accept the same three new optional props and forward them to its
  `VerdictBanner` (line ~140-144).
- `FindingsTab.tsx`: build a `runId → RunSummary` lookup from the `prRuns` prop it already
  receives (`const runById = new Map(prRuns?.map(r => [r.run_id, r]) ?? [])`) and pass
  `costUsd={runById.get(review.run_id ?? "")?.cost_usd ?? null}` (+ the two token fields) into
  each `ReviewRunAccordion`. `prRuns` is already fetched on the PR detail page via
  `usePrRuns(prId)` (`page.tsx:46`) — no new network call.

This is why §3.5 doesn't need to touch `ReviewRecord`: the page already has the run-level
data in hand via `RunSummary[]`; it's matched to its review by `run_id` client-side.

### 4.4 PR detail Timeline row

`RunHistory` (rendered by `FindingsTab`'s "Timeline" section) already receives
`runs: RunSummary[]` and renders one row per run, with a right-aligned meta column currently
holding only the timestamp (`RunHistory.tsx`, the
`{r.ran_at && <span>{new Date(r.ran_at).toLocaleTimeString()}</span>}` block). Since
`RunSummary.cost_usd` already exists (§3.2/3.4), this needs **no server change** — purely a
render addition:

- In that same meta column, above the timestamp, add
  `{settled && <RunCostBadge variant="full" costUsd={r.cost_usd} tokensIn={r.tokens_in} tokensOut={r.tokens_out} />}`,
  gated on `settled` (`r.status === "done"`) the same way the existing findings-count line is
  — a running/failed/cancelled run shows no cost line at all (not a `—`), matching how the
  mockup's errored "General Reviewer" row shows no token/cost text either.
- Deliberate deviation from the mockup's exact Timeline formatting (`9,119 tok · $0.0013` —
  a single combined token count, cost last) in favor of reusing the **same** `RunCostBadge`
  `full` variant already used in §4.3 (`$0.014 · 8.2K→1.3K` — cost first, in→out token pair).
  One consistent cost/token format across the app was judged more valuable than mockup-exact
  parity on this third surface; flag in review if exact parity is wanted instead.

### 4.5 Trace drawer Stats box

`TraceBody` (`client/.../RunTraceDrawer/_components/TraceBody/TraceBody.tsx:63-67`) renders
the Stats section as a flex row of `Stat` tiles (`flex: 1` each, so a 4th tile distributes
evenly with no style changes — `RunTraceDrawer/styles.ts:83-91`), currently `DURATION`,
`TOKENS`, `FINDINGS`.

- Add a 4th `<Stat label={t("trace.stat.cost")} val={formatCostUsd(stats.cost_usd)} />`
  between `TOKENS` and `FINDINGS` (matching the target screenshot's tile order).
- Reuse `formatCostUsd` from `RunCostBadge`'s helpers (`@/components/run-cost-badge/helpers`)
  rather than writing a third money formatter — this is a plain `$X.XXX`/`—` value, not the
  combined "cost · tokens" badge string, so the bare component isn't rendered here, just its
  formatter.
- Add `"trace.stat.cost": "COST"` to `client/messages/en/runs.json` (the `runs` namespace this
  component reads via `useTranslations("runs")`, distinct from `prReview` used by #1-#3).

## 5. Data semantics recap

| Situation | `agent_runs.cost_usd` | Badge shows |
|---|---|---|
| Run `done`, model priced (static table or live OpenRouter price) | `outcome.costUsd` (≥ 0) | `$X.XXX` |
| Run `done`, model NOT in the pricing table | `null` (engine-level, §2) | `—` |
| Run `failed` / `cancelled` | `null` (persisted explicitly, §3.2) | `—` |
| PR never reviewed | no row to join | `—` |

`tokens_in`/`tokens_out` are already always non-null integers on a `done` run and forced to
`0` on failure (existing behavior, unchanged) — the badge only needs the `costUsd == null`
check; it never needs to separately guard on tokens.

## 6. Acceptance criteria

1. A PR whose latest run completed with a priced model shows a `$X.XXX` cost in both the PR
   list row and that run's `VerdictBanner`, and the two numbers **agree** (same run, same
   value) whenever that run is also the newest accordion.
2. A PR that has never been reviewed shows `—` in the list COST column (same row where SCORE
   already shows `—`).
3. A run whose model isn't in the pricing table shows `—`, never `$0.00`.
4. A failed or cancelled run's `VerdictBanner` never shows a cost (n/a — `VerdictBanner`
   isn't rendered for non-`review`-kind entries today; failed runs have no review row at all,
   so this is naturally satisfied — worth a regression test anyway, see §8). Its Timeline row
   shows no cost line at all (gated on `settled`), not a `—`.
5. Zero additional LLM/OpenRouter calls are made to produce any of this — everything comes
   from data already computed during the run.
6. Both vendored `shared` copies (`server/` and `client/`) stay in sync for `PrMeta` and
   `RunSummary` after this change.
7. Every settled run's Timeline row shows its OWN cost/tokens (not the PR's latest-run
   value) — a PR with three settled runs shows (up to) three different badges in the
   Timeline, one per run.
8. The trace drawer's Stats box shows a `COST` tile alongside `DURATION`/`TOKENS`/`FINDINGS`
   for any run, and it agrees with that same run's Timeline badge (#3) — both read
   `cost_usd` off data attached to that one specific run.
9. A failed/cancelled run's trace (built via `traceFromBuffer`) shows `—` for `COST`, not
   `$0.00` — same rule as everywhere else, applied via `stats.cost_usd: null`.

## 7. Out of scope

- Any change to the L07 multi-agent `cost_usd`/`total_cost_usd` scaffolding
  (`AgentColumn`/`MultiAgentRun`/`AgentStats`) — separate feature, already has its own cost
  fields.
- A running-total "spend on this PR" aggregate (sum across all runs/agents) — see §1, decided
  against in favor of each surface reading one specific run's own cost, matching how `score`
  already works for #1/#2.

## 8. Test plan

Server (hermetic unit tests, not `*.it.test.ts` unless a DB round-trip is specifically
needed):

- `run-executor` (or its existing test file): a completed run with a priced model persists
  `cost_usd`; a failed/cancelled run persists `cost_usd: null`.
- `run.repo.ts`: `listRunsForPull` surfaces `cost_usd` on `RunSummary`.
- `pulls/routes.ts`: `GET /repos/:id/pulls` returns `cost_usd` matching the latest review's
  run; returns `null` for a PR with no reviews; returns `null` when the latest run's model
  was unpriced.
- `reviews.it.test.ts` (DB-backed): a completed run's persisted `run_traces.trace.stats`
  carries the same `cost_usd` as its `agent_runs` row and `GET /runs/:id/trace` returns it.

Client (vitest + Testing Library, fetch mocked):

- `RunCostBadge`: compact renders `$0.014`; full renders `$0.014 · 8.2K→1.3K`; both render
  `—` when `costUsd` is `null`.
- `PRRow`: renders the compact badge from `pr.cost_usd`.
- `VerdictBanner`: renders the full badge when cost props are passed; omits/dashes when not.
- `FindingsTab`: the `runById` lookup correctly matches a review to its run and passes
  through the right cost/tokens (covers the `run_id` null/missing-match case too).
- `RunHistory`: a settled run with `cost_usd` renders the full badge next to its timestamp;
  a settled run with `cost_usd: null` renders `—` (not silence); a `running`/`failed`/
  `cancelled` run renders no cost line at all.
- `RunTraceDrawer`/`TraceBody`: the Stats box renders a `COST` tile with `formatCostUsd`
  applied to `trace.stats.cost_usd`.

## 9. Open questions for review

- Exact cost precision (§4.1, 3 decimals + `<$0.001` floor) is a proposal to match the
  mockups, not a hard requirement — flag if a different rounding rule is wanted.
- Whether the client's `PrRowView` type in `client/src/lib/types.ts:38-48` (currently unused
  by `PRRow`, which reads `PrMeta` directly) should also gain a `cost` field — left alone
  here since it isn't on the render path today.
