# Findings by Severity

**Status:** agreed

## Problem

The studio shows findings only as a total: "3 findings" on a run, and nothing at
all in the PR list. To see how many of them are CRITICAL, a reviewer opens each
run and scrolls its cards. The data already exists: every `ReviewRecord` the PR
page loads carries its findings with `severity`, and the PR list already resolves
each PR's latest review for `SCORE` and `COST` (`src/modules/pulls/routes.ts`).
The comment there says the per-severity breakdown is intentionally left off the
list; this feature reverses that.

Goal: show per-severity counts (`ⓘ2 ⚠1 💡2`) in the PR page's Timeline and in
a new PR-list column, and show the findings themselves on hover. Display only:
no filters, no click actions.

## Scope

- `src/modules/pulls`: `GET /repos/:id/pulls` also returns the latest review's
  per-severity counts.
- `src/vendor/shared/contracts/platform.ts`: `PrMeta.findings_by_severity`, plus
  the same lines in `client/src/vendor/shared/`.
- Client (see [`client/specs/02-findings-by-severity.md`](../../client/specs/02-findings-by-severity.md)):
  one shared `SeverityCounts` (chips + hover popover) in
  `src/components/severity-counts/`, shown in two places.

| Where | Chips | Popover data |
| ----- | ----- | ------------ |
| PR detail → Agent runs → Timeline, a `done` run's row | counts of the review that run produced, in place of "N finding(s)"; "· N blockers" stays after them | that review's findings, already on the page (`GET /pulls/:id/reviews`) |
| PR list, new `FINDINGS` column after `SCORE` | `findings_by_severity` of the latest review (the one behind `SCORE` and `COST`) | loaded on first hover via `usePrReviews(pr.id)` → first `kind='review'` |

**Unchanged (no diff at all):**
- the run sidebar (`RunTraceDrawer/**`);
- Review runs: `ReviewRunAccordion`, `VerdictBanner`, `FindingsPanel`,
  `FindingCard`, and their helpers and constants;
- in a Timeline row: the status badge, the agent-name link, the 📄 trace icon and
  the delete icon.

**Out of scope, though in the mockups:** the `trace` link and coloured score in the
Review-run header, "Turn into eval case", and a per-row "Run Review" in the list.

## API / Data

**Contract**: `PrMeta` (`contracts/platform.ts`)

| Field | Type | Meaning |
| ----- | ---- | ------- |
| `findings_by_severity` | `{ CRITICAL, WARNING, SUGGESTION: int } \| null \| undefined` | per-severity counts of the latest `kind='review'` review; list endpoint only; `null` = never reviewed |

It has the same shape as `findings_by_severity` in `contracts/observability.ts`.
It is nullish so that `PrDetail` (which extends `PrMeta`) and older responses
still parse.

**Route**: `GET /repos/:id/pulls`
- The latest-review query also selects `reviews.id`.
- One extra query over `findings` for those ids, `GROUP BY review_id, severity`;
  a missing severity is `0`.
- No migration: counts are computed on read, like `score` and `cost_usd`.

**Counting rules**

| Rule | Why |
| ---- | --- |
| Every finding counts, dismissed and accepted included | the chips break down the same total the run header shows ("3 findings" = `findings.length`) |
| A severity with 0 is not rendered | matches the mockups |
| Never reviewed → `—`; reviewed with no findings → muted `0` | same `—` convention as `SCORE` and `COST` |
| Timeline run with no linked review, or no findings → the old "N finding(s)" text | failed or cancelled runs, runs whose review was deleted |

**Chips**
- Each severity shows its icon and count. Colour and icon come from `SEV`
  (`@devdigest/ui`), the underline is dotted in the severity colour, and the order
  is CRITICAL → WARNING → SUGGESTION.
- All chips of one row are a single hover target, with `cursor: help` and an
  `aria-label` such as "3 findings: 2 critical, 1 warning".
- Chips are not clickable. In the list, a click falls through to the row (opens
  the PR); in the Timeline it does nothing.

**Popover**
- It opens on hover or keyboard focus on the chips, after about 150 ms. It closes
  on mouse-leave from the chips and the popover (about 100 ms grace), or on Esc.
- Header: `ⓘ N FINDINGS`, where N is the sum of the counts.
- It lists every finding of that review, sorted CRITICAL → WARNING → SUGGESTION
  (stable). Each shows a compact severity badge, title and category tag, a
  `file:line` link to GitHub at the PR head sha (new tab), the confidence, and the
  rationale clamped to two lines.
- A dismissed finding is muted, with its title struck through.
- While loading it shows skeleton rows; on error, one line of text. Long lists scroll.
- It renders in a portal with fixed positioning, under the chips and aligned to
  their left edge, and flips above when there is no room below. The list's table
  card has `overflow: hidden` and would clip it otherwise.
- Clicks inside it stop propagation: React bubbles portal events to the row,
  whose click would open the PR.

## Acceptance criteria

1. `GET /repos/:id/pulls` returns `findings_by_severity` of the same review whose
   `score` and `cost_usd` it returns. An older review's findings never count, and
   an unreviewed PR gets `null`.
2. Dismissed findings are counted: in the Timeline, the sum of a run's chips
   equals its Review-run header's "N findings".
3. PR list: an unreviewed PR shows `—`, a reviewed PR with no findings shows `0`,
   anything else shows only its non-zero chips.
4. Timeline: each `done` run with findings shows its own review's chips, then
   "· N blockers" when it has blockers. Other runs keep the "N finding(s)" text.
5. Hovering the chips shows the popover with every finding of that review,
   CRITICAL first. Esc and mouse-leave close it. In the list's last row it opens
   upward and is not clipped.
6. Clicking a link in the popover opens GitHub and does not navigate to the PR.
7. The diff touches none of the files listed as unchanged, and e2e flow 04 passes as is.
8. Tests:
   - the DB-backed flow asserts the counts: latest review only, zeros, dismissed
     counted, `null` for an unreviewed PR;
   - the contract test parses `PrMeta` with and without the field;
   - client tests cover `SeverityCounts` (zeros hidden, order, hover popover, Esc,
     loading), the Timeline row, and the list cell, including the lazy
     `usePrReviews` and no navigation from a popover link.

## Open questions

- The list popover mockup mixes Security and Performance findings, but the source
  is one latest review, which belongs to one agent. The popover shows only that
  review's findings, so that `FINDINGS`, `SCORE` and `COST` in a row describe the
  same review. Summing the latest run of every agent would be a separate change.

## Amendment (2026-09-23) — HW1 grading criteria

Supersedes the sections above where they disagree; the text above stays as the
original agreement.

- **Popover header** reads `ⓘ N FINDINGS IN THIS RUN` (was `ⓘ N FINDINGS`):
  message `severityCounts.header` = "N finding(s) in this run", uppercased by CSS.
  Test: `SeverityCounts.test.tsx` ("3 findings in this run").
- **Finding actions in Review runs** are labelled **Accept** and **Reject**; the
  status tag reads `rejected`. Copy only (`prReview.json` → `finding.dismiss`,
  `finding.dismissed`): the API action stays `dismiss`, the field `dismissed_at`.
  Test: `FindingCard.test.tsx` ("fires accept/dismiss actions").
