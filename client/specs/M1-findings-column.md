# M1 — Findings column on the PR list (client)

Status: built

## Problem

The PR list does not show what the reviews found. To learn whether a PR has a
critical finding, a reviewer has to open it and go to the Agent runs tab.

## Goals

- The PR list has a FINDINGS column: one chip per severity that has findings,
  with the severity icon and the number.
- Hovering the chips opens a preview headed `N findings in this run` that
  lists the findings, without leaving the list.
- The number covers every agent that reviewed the PR: it is the sum over each
  agent's latest review, and the preview lists exactly those findings.

## Non-goals

- Filtering or sorting the list by findings.
- Accepting or dismissing a finding from the preview.
- Severity icons in the Timeline or the Trace.
- A change to `@devdigest/ui`.

## Behaviour

- The column sits between SCORE and STATUS.
- Chips appear in the order CRITICAL, WARNING, SUGGESTION. A level with no
  findings has no chip. A PR with no findings, or one that was never reviewed,
  shows `—` and has no preview.
- The counts come from `PrMeta.findings_counts` on the list response.
- Hovering the cell, or focusing it with the keyboard, opens the preview under
  the cell. Moving the pointer onto the preview keeps it open; leaving both
  closes it, as does `Escape`.
- The preview loads the PR's reviews the first time it opens
  (`GET /pulls/:id/reviews`) and shows a loading line until they arrive. The
  result is cached, so a second hover sends no request.
- The preview applies the server's rule to those reviews: for each agent, only
  its latest review counts. Its heading is `N findings in this run`, where N is
  the number of findings listed, so the heading, the list and the chips agree.
- Findings are sorted by severity. Each line shows the severity icon, the
  title, `file:line` and the agent's name. At most six are listed; the rest are
  summarised as `+K more`.
- Clicking the cell opens the PR on its Agent runs tab. Clicking elsewhere on
  the row still opens the PR overview.
- The list refreshes every 60 seconds, so right after a new run the chips can
  lag behind the preview until the next refresh.

## Changes

- Routes: none. `src/app/repos/[repoId]/pulls/page.tsx` renders the new header
  through `COLUMN_KEYS`.
- Components (under `src/app/repos/[repoId]/pulls/`):
  - `_components/FindingsCell/` — new: the chips, the hover state and the
    preview (`FindingsPopover`).
  - `_components/PRRow/PRRow.tsx` — renders the cell.
  - `constants.ts` — a new `GRID` track and the `findings` column key.
  - `helpers.ts` — `latestFindingsPerAgent`.
  - No `@devdigest/ui` change: `SeverityBadge` (compact, with a count) is the
    chip. The kit has no popover, and `Dropdown` opens on click with a fixed
    item list, so the preview is local.
- Hooks: none added. `usePrReviews(prId)` is called with `null` until the
  preview opens.
- Strings: `messages/en/prReview.json` → `list.columns.findings`,
  `list.findingsPopoverTitle`, `list.findingsMore`, `list.findingsLoading`,
  `list.findingsLabel`.
- Contracts: `PrMeta.findings_counts` (new, must match the server copy),
  `ReviewRecord`, `FindingRecord`.

## Acceptance criteria

- [x] The list has a FINDINGS column with a chip per severity that has findings.
- [x] A PR without findings shows `—` and opens no preview.
- [x] Hovering the chips shows a preview headed `N findings in this run`.
- [x] N equals the sum of the chips and the number of findings in the preview.
- [x] For a PR reviewed by two agents, the preview lists both agents' findings
      and names each agent.
- [x] A superseded review by the same agent is not listed.
- [x] No reviews request is sent until the preview opens.
- [x] Clicking the cell opens the Agent runs tab and does not also trigger the row.

## Tests

- `pulls/helpers.test.ts`: `latestFindingsPerAgent` — two agents, a superseded
  review, a summary review, the severity order.
- `_components/FindingsCell/FindingsCell.test.tsx`: chips and their counts; `—`
  without findings; no request before hover; hover shows the heading and both
  agents' findings; `+K more`; a click opens the Agent runs tab without
  triggering the row.
- e2e `02-repo-pulls-detail.flow.json`: the seeded PR's total cost changes with
  the second seeded run.

## Related specs

- [server/specs/M1-findings-column.md](../../server/specs/M1-findings-column.md)

## Open questions

- None.
