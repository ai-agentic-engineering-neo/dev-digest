# 02 — Findings by severity (client)

Client-only feature. There is no server change: every number comes from the
`ReviewRecord.findings` the PR page already loads.

## Goal

A reviewer opens a run and sees at a glance how bad it is, for example
`3 CRITICAL · 5 WARNING · 2 SUGGESTION`. One click narrows the list to a single
level.

## Where

PR page → **Agent runs** tab → **Review runs** section → expand a run card
(`ReviewRunAccordion`). The counters sit under the `VerdictBanner` (verdict + PR SCORE),
at the top of that run's `FindingsPanel`:

```
┌ VerdictBanner ─────────────────────────────── (38) PR SCORE ┐
└──────────────────────────────────────────────────────────────┘
[⊘ CRITICAL 3] · [△ WARNING 5] · [💡 SUGGESTION 2]      ← counters
Filter: [Critical] [Warning] [Suggestion]    Hide low confidence ○
FindingCard …                                             ← filtered list
```

The Timeline tiles keep their own severity icons. They are not touched and do not filter.

## Behaviour

- **Counters**: one `SeverityBadge` with a count per severity that has at least one
  finding, in order CRITICAL → WARNING → SUGGESTION → INFO, separated by `·`.
  A severity with 0 findings gets no pill. If the run has no findings, the row is absent.
- **The counts are true to the list**: they are taken *after* "Hide low confidence"
  and *before* the severity filter. So a pill's number always equals the number of
  cards of that severity that the list shows when that level is selected. Dismissed
  and accepted findings are still rendered as cards, so they are counted too.
- **Filter**: three toggle buttons, **Critical**, **Warning** and **Suggestion**
  (`aria-pressed`). A button is always shown, even when its count is 0.
  Single-select: a click selects that level and replaces any other selection.
  Clicking the active one again clears the filter and brings back the full list.
  A click on a counter pill does the same as the matching button.
- The filter is per run card (local state). The j/k focus goes back to the first
  shown card whenever the filter changes.
- **No LLM and no network**: counting and filtering are a pure `reduce`/`filter`
  over data already in memory (`FindingsPanel/helpers.ts`).

## Hover popover: PR list and timeline

The severity counters (`⊘ 2  △ 2  💡 2`, dotted underline, not clickable) with a
read-only popover **"N FINDINGS IN THIS RUN"**. Each preview shows the severity
icon, title, category, `file:line`, confidence % and a 2-line rationale.
It has **no buttons**: Accept/Dismiss exist only on the FindingCard inside the
Review runs accordion. Shared component: `src/components/findings-hover/`.

| Where | Counts from | Popover findings |
|---|---|---|
| PR list → FINDINGS column (`PrFindingsCell`) | `PrMeta.findings_counts` of the latest review (server, see [`server/specs/02-findings-counts.md`](../../server/specs/02-findings-counts.md)) | `GET /pulls/:id/reviews`, fetched **on first hover** only, and the review whose `id === latest_review_id` is picked. The PR has no review → `—`. |
| PR page → Agent runs → Timeline tile (`RunHistory`) | the run's findings, found through `ReviewRecord.run_id` (already loaded for Review runs) | the same list; no request |

A timeline tile whose findings are not loaded falls back to the old
"N finding(s)" text. The PR table card is `overflow: visible`, so the popover can
leave it. The last two rows open the popover upwards.

## Out of scope

- Category filter ("All categories" chip in the design).
- Persisting the filter in the URL.
- An e2e check of the timeline popover: the seed creates no agent runs, so the
  seeded PR has no run tiles. It is covered by `RunHistory.test.tsx`.

## Acceptance criteria

1. An expanded run with 3 CRITICAL, 5 WARNING and 2 SUGGESTION findings shows
   `CRITICAL 3 · WARNING 5 · SUGGESTION 2`. A run with no WARNING findings shows no WARNING pill.
2. Clicking **Warning** leaves exactly the 5 WARNING cards. Clicking **Warning** again shows all 10.
3. Clicking **Critical** while **Warning** is active switches to CRITICAL only.
4. With "Hide low confidence" on, the pills show the counts of the cards that remain.
5. Opening the page or toggling a filter sends no request (the unit tests use no fetch mock).

## Open questions

- The design (`FindingsPanel` in the standalone mockup) uses multi-toggle chips
  with counts. We follow the homework acceptance spec instead, which asks for a
  separate counters row and single-select buttons.
