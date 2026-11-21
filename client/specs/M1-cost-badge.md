# M1 — Run cost badge (client)

Status: built

## Problem

The studio does not show what an agent run cost, so a reviewer cannot weigh
review quality against spend.

## Goals

Show run cost with the `RunCostBadge` component, which has two variants:

| Where | Variant | Data |
|---|---|---|
| PR list, COST column (between STATUS and UPDATED) | compact `$0.012` | `PrMeta.last_run_cost_usd` |
| PR detail, Agent runs, Timeline row (under the time) | detailed `$0.014 · 8.2K→1.3K` | `RunSummary.cost_usd`, `tokens_in`, `tokens_out` |
| PR detail, Review runs header (before the date) | compact | `RunSummary.cost_usd` matched by `run_id` |
| Agent run drawer, Stats | COST tile between TOKENS and FINDINGS | `RunStats.cost_usd` |

## Non-goals

- The FINDINGS column and Run Review button from the design mock-up.
- A total per PR, and cost charts.

## Behaviour

- Cost format: at least 3 significant digits.
  - `≥ $0.01` → 3 decimals (`$0.012`, never `$0.01`).
  - Below that → 2 significant digits (`$0.0013`).
  - A genuinely free run → `$0.000`.
- Token format: `800`, `8.2K`, `15K`, `1.3M`.
- No data → `—`, never `$0.00`. This covers a PR with no completed run, a
  running, failed or cancelled run, a run stored before M1, and a model with
  no known price.
- The Timeline shows the badge only for `status === "done"`. A failed run's
  0 tokens are never shown as `0→0`.
- A done run with unknown cost shows only the tokens (`8.2K→1.3K`).
- Hovering the badge shows the unrounded value in `title`, so it can be checked
  against the run log or the OpenRouter dashboard.

## Changes

- Component: `src/app/repos/[repoId]/pulls/_components/RunCostBadge/`
  (`RunCostBadge.tsx`, `helpers.ts` with `formatCost` / `formatTokenCount`, test).
- PR list:
  - `pulls/constants.ts`: `GRID` and `COLUMN_KEYS`
  - `pulls/_components/PRRow/PRRow.tsx`
- PR detail:
  - `RunHistory.tsx`
  - `ReviewRunAccordion.tsx`: new `costUsd` prop
  - `FindingsTab.tsx`: builds a `run_id → cost` map from the already-loaded
    `usePrRuns`, with no change to the reviews contract
- Drawer: `RunTraceDrawer/_components/TraceBody/TraceBody.tsx`.
- Strings:
  - `messages/en/prReview.json` → `list.columns.cost`
  - `messages/en/runs.json` → `trace.stat.cost`
- Contracts: `PrMeta`, `RunSummary` and `RunStats`, mirrored from the server copy.
- No new hooks or endpoints.

## Acceptance criteria

- [x] A completed run shows its cost in all four places.
- [x] A run without data shows `—`, not `$0.00`.
- [x] Costs show at least 3 significant digits (`$0.012`, `$0.0013`).

## Tests

- `RunCostBadge.test.tsx`: formatting, both variants, `null` → `—`.
- `RunHistory.test.tsx`: a done run shows `$0.014 · 8.2K→1.3K`, and a failed run shows `—`.
- `RunTraceDrawer.test.tsx`: the COST tile shows `$0.014`.
- e2e `02-repo-pulls-detail.flow.json`: the list shows the seeded `$0.014`.

## Related specs

- [server/specs/M1-cost-badge.md](../../server/specs/M1-cost-badge.md)

## Open questions

- None.
