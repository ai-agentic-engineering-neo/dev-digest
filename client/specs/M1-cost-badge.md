# M1 · Run cost badge (client)

Server side and data rules: `server/specs/M1-cost-badge.md`.

## Goal
Show the cost (USD) and tokens of agent review runs on three screens.

## User-visible behaviour

**1. Pull Requests list.** A new **Cost** column sits between Status and Updated.
- It shows the latest-round cost, for example `$0.014`, or `—`.
- `PRRow` → `<RunCostBadge variant="compact" />`.

**2. PR detail → Agent runs timeline.** Each settled (`done`) run card shows `9,119 tok · $0.0013` under the run time.
- Hovering shows the exact value: `$0.001284 · 8,201 in / 918 out`.
- A failed, running or cancelled card shows no badge.
- A run with tokens but no price shows `9,119 tok · —`.
- `RunHistory` → `<RunCostBadge variant="inline" />`.

**3. Run drawer → Stats.** The tiles read DURATION / TOKENS / **COST** / FINDINGS.
- COST uses `formatUsd(stats.cost_usd)`.
- A trace saved before M1 shows `—`.

## Formatting (`src/lib/format-cost.ts`)
`formatUsd` picks the decimals by size:

| Value | Output |
|---|---|
| under $0.01 | 4 decimals: `$0.0013` |
| under $1 | 3 decimals: `$0.014` |
| $1 and above | 2 decimals: `$1.24` |
| null | `—` |
| exactly 0 (free model) | `$0.00` |

Token totals use `Intl` grouping, for example `9,119`. A total of 0 or null counts as no data.

## Components
- `src/app/repos/[repoId]/pulls/_components/RunCostBadge/`, with two variants: `compact` and `inline`.
- It is presentational only and fetches nothing.
- Strings live in `messages/en/prReview.json`:
  - `list.columns.cost`
  - `costBadge.tokens`
  - `costBadge.tooltip`
- The tile label is in `messages/en/runs.json` under `trace.stat.cost`.

## Acceptance
- [x] `src/lib/format-cost.test.ts`
- [x] `RunCostBadge.test.tsx`: both variants, null, tokens-only.
- [x] `RunHistory.test.tsx`: a done run shows the badge; a failed run does not.
- [x] `RunTraceDrawer.test.tsx`: the COST tile comes in order, and an old trace shows `—`.
