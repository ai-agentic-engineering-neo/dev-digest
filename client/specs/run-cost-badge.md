# Run Cost Badge (L01) — client

Show cost and tokens per run on four surfaces. Data model and API are in
[`server/specs/run-cost-badge.md`](../../server/specs/run-cost-badge.md).

Status: **implemented 2026-09-25** (all four surfaces, showcase entry, unit tests, e2e flow `08-run-cost`; hermetic e2e 8/8 green). Written 2026-09-25.

## Surfaces

| # | Where | Data | Rendering |
|---|---|---|---|
| 1 | PR list, new **COST** column (`/repos/:repoId/pulls`) | `PrMeta.cost_usd`, `cost_runs` | compact badge `$0.012`; tooltip «3 runs» |
| 2 | PR detail → Agent runs → Timeline row (`RunHistory`) | `RunSummary` | full badge `9,119 tok · $0.0013` under the time, settled runs only |
| 3 | Run trace drawer → Stats (`TraceBody`) | `RunTrace.stats` | COST stat tile between TOKENS and FINDINGS: `$0.06` |
| 4 | PR detail → Review runs accordion header (`ReviewRunAccordion`) | `RunSummary` joined by `review.run_id` | full badge before the score badge |

Design references: the Agent runs screenshot (surface 2) and the drawer
screenshot (surface 3). Surfaces 1 and 4 follow the lab slide («$0.012»,
verdict-plate line) and reuse the same component.

## Component: `RunCostBadge`

Location: `client/src/components/run-cost-badge/` (cross-page piece, like
`app-shell`). Not in `vendor/ui`: the design system is off limits unless the
task is about it. Added to the `/showcase` gallery so the smoke test mounts it.

```ts
type Props = {
  costUsd: number | null | undefined;
  tokensIn?: number | null;
  tokensOut?: number | null;
  variant: "compact" | "full";
  title?: string;           // tooltip
};
```

Behaviour:
- `costUsd == null` → renders «—» in `var(--text-muted)` for both variants.
  Tokens alone never render a badge.
- `compact` → `formatCost(costUsd)`.
- `full` → `${formatTokenTotal(in + out)} tok · ${formatCost(costUsd)}`,
  mono, `tnum`, accent color as in the timeline design. If tokens are missing
  but cost is known, only the cost part renders.
- Purely presentational; no hooks, no fetch.

## Formatting (`client/src/lib/format-cost.ts`)

`formatCost(usd)` — adaptive precision (decided 2026-09-25):

| Input | Output |
|---|---|
| `null` / `undefined` | `—` |
| `0` | `$0.00` |
| `1.234` | `$1.23` |
| `0.1` | `$0.10` |
| `0.06` | `$0.06` |
| `0.012` | `$0.012` |
| `0.0013` | `$0.0013` |
| `0.00999` | `$0.01` |

Rule: `>= 0.10` → two decimals; `< 0.10` → two significant digits
(`toPrecision(2)`), trailing zeros trimmed but never below two decimals.
(Corrected during implementation: a `0.01` threshold rendered the design's
`$0.012` as `$0.01`.)

`formatTokenTotal(n)` → thousands-separated integer (`9,119`), via
`Intl.NumberFormat("en-US")`.

The drawer keeps the existing `formatTokens` (`15k→1.2k`) for its TOKENS tile.

## Per-surface changes

### 1. PR list

- `pulls/constants.ts`: `GRID` gains a `72px` track after `score`;
  `COLUMN_KEYS` gains `"cost"` after `"score"`.
- `messages/en/prReview.json`: `list.columns.cost: "Cost"`,
  `list.costRuns: "{count, plural, one {# run} other {# runs}}"`.
- `PRRow.tsx`: new cell with `<RunCostBadge variant="compact" costUsd={pr.cost_usd} title=… />`.
- New `PRRow.test.tsx`: `cost_usd: null` → «—»; `cost_usd: 0.012` → `$0.012`.

### 2. Timeline

- `RunHistory.tsx`: in the right-hand column, under the time, render
  `<RunCostBadge variant="full" …/>` when `settled` (`status === "done"`).
  Failed, cancelled, and running rows show nothing.
- `RunHistory.test.tsx`: fixture gains `cost_usd`; cases for done+cost
  (`9,119 tok · $0.0013` given `tokens_in 8190`, `tokens_out 929`),
  done+null (`—`), failed (no badge).

### 3. Drawer Stats

- `messages/en/runs.json`: `trace.stat.cost: "COST"`.
- `TraceBody.tsx`: `<Stat label={t("trace.stat.cost")} val={formatCost(stats.cost_usd)} />`
  after TOKENS.
- `RunTraceDrawer.test.tsx`: fixture `stats.cost_usd: 0.06`; assert `$0.06`.

### 4. Review runs accordion

- `FindingsTab.tsx` already has both `prRuns` (RunSummary[]) and `runs`
  (ReviewRecord[]). Pass `run={prRuns.find(r => r.run_id === review.run_id)}`
  to each accordion (lists are tiny; a Map was not worth the extra state).
- `ReviewRunAccordion.tsx`: new optional prop `run?: RunSummary`; render
  `<RunCostBadge variant="full" …/>` before the score badge when
  `run?.status === "done"`.
- No contract change to `ReviewRecord` (client-side join; rejected
  alternative: adding run stats to `ReviewRecord` on the server).

### Contract sync

Copy `server/src/vendor/shared/contracts/trace.ts` and `platform.ts` over the
client copies after the server change. Leave the other drifted files alone.

## e2e

New `e2e/specs/08-run-cost.flow.json` against the seeded run
(see server spec, seed step): PR list shows `$0.0013` on PR #482; open the PR,
Agent runs tab shows `9,119 tok · $0.0013`; open the trace, Stats shows
`COST` and `$0.0013`. Add the row to the coverage table in `e2e/README.md`.
Deterministic: no model call, seeded data only.

## Acceptance criteria

1. All four surfaces show the same number for the same run.
2. A run without cost shows «—» everywhere; `$0.00` appears only for a
   priced-at-zero model.
3. Running, failed, and cancelled runs show no badge on surfaces 2 and 4.
4. PR list header and rows stay aligned (same `GRID`), column is `Cost`.
5. `pnpm typecheck`, `pnpm test`, and the showcase smoke test pass.
6. e2e flow 08 passes on the hermetic stack.

## Plan (ordered, after the server PR is merged or on the same branch)

1. Sync the two contract files.
2. `lib/format-cost.ts` + `format-cost.test.ts`.
3. `components/run-cost-badge/` + showcase entry.
4. Surface 3 (drawer) — smallest, validates the contract end to end.
5. Surface 2 (timeline) + tests.
6. Surface 4 (accordion) + FindingsTab wiring.
7. Surface 1 (list) + tests + i18n.
8. e2e flow 08 + README row.
9. `engineering-insights` wrap-up sweep for `client/` and `e2e/`.

Commits: `feat(reviews): run cost badge on timeline, drawer and review runs`,
`feat(pulls): cost column on the PR list`, `test(e2e): run cost flow`.

## Decisions

- **Full badge text is `N,NNN tok · $x`** (the higher-fidelity timeline
  design), reused on the accordion. Rejected: the slide's `$x · 8.2K→1.3K`
  in→out form; the drawer already shows in→out in its own tile.
- **Column placement: after SCORE, before STATUS.** Keeps review-derived
  columns together; no list design was provided.
- **Component outside `vendor/ui`.** Design-system changes are out of scope
  per the root `CLAUDE.md`.
