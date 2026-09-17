# Findings labels and cost in the UI

Where the severity counts, the hover popover, the severity filter and the cost
values are rendered, and the rules each follows. The server side is in
[`server/docs/findings-read-model.md`](../../server/docs/findings-read-model.md)
and [`server/docs/run-lifecycle-and-cost.md`](../../server/docs/run-lifecycle-and-cost.md).
The product spec is [`../specs/pr-findings-labels.md`](../specs/pr-findings-labels.md).

## Map

| Screen → place | Component | Data |
| --- | --- | --- |
| PR list → FINDINGS column | `FindingsBadges` (`src/components/findings-summary/FindingsBadges.tsx`) | `PrMeta.findings` (latest review) |
| PR list → COST column | `RunCostBadge` (`src/components/run-cost-badge/RunCostBadge.tsx`) | `PrMeta.cost_usd` (sum of done runs) |
| PR → Agent runs → Timeline row | `FindingsBadges` + `RunCostBadge variant="detailed"` (`[number]/_components/RunHistory/RunHistory.tsx:196`, `:207`) | `RunSummary.findings`, `cost_usd`, tokens |
| PR → Agent runs → Review runs card | `VerdictBanner` (cost), `FindingsPanel` → `SeverityPills` + `FindingCard` | `ReviewRecord` |
| Trace drawer → Stats | `Stat label="COST"` with `formatUsd` (`RunTraceDrawer/_components/TraceBody/TraceBody.tsx:67`) | `RunTrace.stats.cost_usd` |

Two shared components are reused on both screens and live in
`src/components/`, not under a route's `_components/`.

## Severity badges and popover (`findings-summary`)

- Shows one compact `SeverityBadge` per **non-zero** severity, always in the
  order CRITICAL, WARNING, SUGGESTION. No summary, or all zeros, renders "—".
- Hovering or focusing opens `FindingsTooltip` with the header
  "N findings in this run" and a **read-only** preview per finding: severity,
  title, category, `file:line[-end]`, confidence, and a 2-line rationale (cut to
  240 characters by the server). It has no actions, by design; Accept and
  Dismiss live only on the PR page.
- The tooltip uses `position: fixed` from `getBoundingClientRect()`
  (`positionFor`, `FindingsBadges.tsx:20`) and flips above the trigger in the
  lower half of the viewport. It can't be `absolute`, because the PR table card
  has `overflow: hidden` (see client [`INSIGHTS.md`](../INSIGHTS.md)).
- A 120 ms close delay (`CLOSE_DELAY_MS`) lets the pointer move from the badges
  into the tooltip. Clicks inside the tooltip call `stopPropagation`, so they
  don't trigger the PR row's navigation (`PRRow.tsx:26`).

## Severity pills and filter (`FindingsPanel`)

Inside an expanded review-run card, under the verdict:

```ts
counts = countBySeverity(visibleFindings(findings, hideLow))        // before severity filter
active = severity && counts[severity] > 0 ? severity : null         // inert if emptied
shown  = visibleFindings(findings, hideLow, active)
```

(`[number]/_components/FindingsPanel/FindingsPanel.tsx`, helpers in `helpers.ts`)

- **Counts are taken before the severity filter**, so each pill's number equals
  the number of cards you get by clicking it.
- **Counts follow "Hide low confidence"**: they shrink with the list so they
  still match the cards.
- Clicking a pill sets the filter, clicking it again clears it, and clicking
  another pill switches to that one. The state is local `useState`, not the URL.
  Changing the filter resets j/k focus to the first card.
- If hiding low-confidence findings removes every card of the active severity,
  the filter turns itself off instead of showing an empty list.
- Unlike the badges, the pills **include dismissed findings**, because the
  cards still render them (muted). This is why the pill total can be higher
  than the Timeline/PR list count for the same run.
- Everything is computed from the data already loaded; no extra request and no
  LLM call.

Accept and Dismiss buttons are on `FindingCard` (`FindingCard.tsx:98`, `:108`) and call
`useFindingAction` (see [`data-flow.md`](data-flow.md#known-staleness) for what
it refreshes).

## Cost formatting (`run-cost-badge`)

`formatUsd` (`src/components/run-cost-badge/helpers.ts:12`) is the only
formatter; the trace drawer imports it too:

| Input | Output |
| --- | --- |
| `null` / `undefined` / non-finite | `—` (unknown, **never** `$0`) |
| `0` | `$0` |
| positive, but `toFixed(4)` rounds to `0.0000` | `<$0.0001` |
| `< 1` | up to 4 decimals, trailing zeros trimmed (`$0.0013`) |
| `≥ 1` | 2 decimals (`$1.25`) |

Timeline rows show cost only for `done` runs, while running and failed rows
show nothing. The detailed variant adds `· 9.1K→1.2K` tokens even when cost is
unknown.

## Strings

Labels come from `messages/en/common.json` (`runCost`, `findingsSummary`),
`prReview.json` (`panel.severityPill`, `panel.severityFilter`,
`panel.clearFilter`, `list.columns.findings/cost`) and `runs.json`
(`trace.stat.cost`). The pill text is sentence case ("2 Critical") and is
uppercased by CSS, so tests should assert on the sentence-case text.
