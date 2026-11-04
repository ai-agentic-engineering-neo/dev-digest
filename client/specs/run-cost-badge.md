# Run Cost Badge — client

Server half (data, contracts, migration): [../../server/specs/run-cost-badge.md](../../server/specs/run-cost-badge.md).

## Goal

Show what each agent run cost, and what a PR cost in total, in three places of the studio.
Data comes from fields the server adds (`PrMeta.cost_usd`, `RunSummary.cost_usd`,
`RunTrace.stats.cost_usd`); the client makes no extra requests and no model calls.

## Scope

### 1. `RunCostBadge` component (new)
Location: `src/components/run-cost-badge/` (app-level shared: used by two routes + `/showcase`) —
standard folder shape (`RunCostBadge.tsx`, `index.ts`, `styles.ts`, `constants.ts`, `helpers.ts`,
`RunCostBadge.test.tsx`).
**i18n-free by design:** `/showcase`'s `Gallery` is rendered by the smoke test WITHOUT an intl
provider, so the component must not call `useTranslations`; callers pass the translated `tokenUnit`.
Two variants:
- `compact` — cost only: `$0.014`.
- `detailed` — tokens + cost: `9,119 tok · $0.0013`.

Props: `{ variant: "compact" | "detailed"; costUsd: number | null | undefined; tokensIn?: number | null; tokensOut?: number | null; tokenUnit?: string }` (`tokenUnit` default `"tok"`). `title` tooltip shows `in → out`.

Formatting (`helpers.ts`, pure, unit-tested):
- `formatCost(usd)`: `null`/`undefined` → `—`; `0 < usd < 0.01` → 4 decimals (`$0.0013`);
  otherwise 3 decimals (`$0.014`, `$0.060`). Exactly `0` (priced, nothing spent) → `$0.000`.
- detailed tokens = `tokensIn + tokensOut`, thousands-separated (`9,119 tok`); omitted when both are null.
- Styling: mono font, `var(--text-muted)`, inline style objects off CSS variables, no hard-coded colors.
- Add both variants (incl. the `—` case) to `/showcase` (`src/components/showcase/Showcase.tsx`).

### 2. PR list — COST column
- `pulls/constants.ts`: insert `"cost"` into `COLUMN_KEYS` between `status` and `updated`; widen `GRID`
  with one more track (~80px).
- `PRRow.tsx`: new cell `<RunCostBadge variant="compact" costUsd={pr.cost_usd} />`.
- Value = total spend on the PR (sum of all its runs, computed server-side). Not reviewed → `—`.

### 3. PR detail — Timeline run row
- `RunHistory.tsx` (~line 199, the right-hand meta next to `ran_at`): second line under the time,
  `<RunCostBadge variant="detailed" costUsd={r.cost_usd} tokensIn={r.tokens_in} tokensOut={r.tokens_out} />`.
- Shown for `done`, `failed` and `cancelled` runs (failed runs show the PARTIAL spend persisted by the
  server); hidden while `running`.

### 4. Run trace drawer — Stats tile
- `RunTraceDrawer/_components/TraceBody/TraceBody.tsx`: add `<Stat label={t("trace.stat.cost")} val={formatCost(stats.cost_usd)} />`
  between TOKENS and FINDINGS (order: DURATION · TOKENS · COST · FINDINGS).
- Uses the shared `formatCost` from `@/components/run-cost-badge`.

### i18n (`messages/en/*.json`, no literals)
- PR list column header: `prReview.list.columns.cost` = `"Cost"`.
- Trace stat label: `runs.trace.stat.cost` = `"COST"` (same casing as the sibling `TOKENS`).
- Token unit: `prReview.cost.tokenUnit` = `"tok"`, passed by `RunHistory` as `tokenUnit`.

### Types
- Only via `@devdigest/shared` (`src/vendor/shared`, edited by the server task in both copies).
  Do not redefine types locally.

## Out of scope
- FINDINGS column and per-row "Run Review" button seen in the PR-list mock.
- Cost line in `VerdictBanner` (mentioned on the lab slide, not requested).
- Sorting/filtering by cost.

## Acceptance criteria
1. PR list has a COST column; each PR shows its total spend (`$0.014`) or `—`.
2. Every finished timeline run (incl. failed with partial spend) shows `N tok · $X` under its time;
   runs without cost data show `—`, never `$0.00`.
3. Trace drawer Stats shows a COST tile next to DURATION / TOKENS / FINDINGS; old traces → `—`.
4. All visible text via next-intl; no hard-coded colors; no new fetches.
5. Tests: `helpers` unit (null / <0.01 / ≥0.01 / 0), `RunCostBadge` render both variants,
   updated `RunHistory.test.tsx` and `RunTraceDrawer.test.tsx` fixtures (with and without `cost_usd`);
   showcase smoke test passes. `pnpm typecheck && pnpm test`.
