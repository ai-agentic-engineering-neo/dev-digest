# M1 — Severity counters + filter on a review run (client)

## Goal
In an expanded run on **PR → Agent runs**, show how many findings of each severity
the run produced — `3 CRITICAL · 5 WARNING · 2 SUGGESTION` — and let the user click
a level to see only that level's findings in that run's list.

## Scope / Non-goals
| Piece | Where | Does |
|---|---|---|
| `SeverityFilter` | `pulls/[number]/_components/SeverityFilter` | Three counter pills (contract order), single-select; re-click on the active pill clears |
| `countBySeverity` | `FindingsPanel/helpers.ts` | Per-level counts seeded with 0 from the `Severity` contract |
| `visibleFindings(…, severity)` | `FindingsPanel/helpers.ts` | Confidence filter AND severity filter, then sort |
| `FindingsPanel` | toolbar | Counters · divider · Hide low confidence; filter state per run |

- Counters show the **run's totals**, independent of "Hide low confidence". The list
  applies both filters together (AND). This was decided with the user on 2026-11-24.
- The active pill has the border, text and background of its `SEV` colour. The other
  two pills are dimmed. The state never depends on hover, and with no filter all three
  pills look the same.
- Accept/dismiss refetches `["reviews", prId]`, so the counters recompute from the new
  props and the filter stays on.

**Run header + PR list counts (added 2026-11-25 at the user's request):**
`SeverityCounts` (`src/components/severity-counts`) appears in the `ReviewRunAccordion` header
and in the PR list's **Findings** column. The PR list combines the latest review of each
agent (a re-run of the same agent replaces its earlier review), which
`GET /repos/:id/pulls` now returns as `PrMeta.findings`; a PR with no findings
shows "—". The Score ring is unchanged: it still shows the newest review's score. The component shows an icon + count, in the `SEV` colour with a
dotted underline, for each level that has findings. Hover opens a popover listing
the run's findings: severity, title, category, `file:line`, confidence and a 2-line
rationale. Click pins it open; click again, Escape or an outside click closes it.
It is portalled to `<body>` because the accordion clips overflow, and it stops
click/key events so the run doesn't collapse.

**Non-goals:**
- Changing the `blockers` number in the `ReviewRunAccordion` header.
- `FindingCard`.
- The Findings column and hover popover in the PR list, which already exist.
- Persisting the filter across reloads or sharing it between runs.

## API / contract changes
None. The feature reads the already-loaded `ReviewRecord.findings` from `usePrReviews`.
There are no new requests and no model calls. Severity levels come from the
`Severity` contract in `@devdigest/shared`; colours, icons and level names come from
`SEV` in `@devdigest/ui`.

## Acceptance criteria
1. An expanded run shows counters for all three levels in the format `N CRITICAL · N WARNING · N SUGGESTION`. A level with no findings shows 0.
2. The numbers equal the number of findings of each level in that run.
3. Clicking a level leaves only that level's findings in the list. Clicking another
   level moves the filter to it. Clicking the active level again clears the filter.
4. With both filters on, the list shows only findings that pass both.
5. If no findings remain after filtering, the existing `EmptyState` appears.
6. All strings come from `messages/en/prReview.json` (`panel.severityFilter.*`).
7. Tests:
   - `FindingsPanel/helpers.test.ts`
   - `SeverityFilter/SeverityFilter.test.tsx`
   - `FindingsPanel/FindingsPanel.test.tsx`
