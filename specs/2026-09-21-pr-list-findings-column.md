# Spec: Findings column with read-only preview on the pull-request list

| | |
|---|---|
| **Spec ID** | SPEC-2026-09-21-pr-list-findings-column |
| **Status** | approved |
| **Supersedes** | none |

## Problem & why

The pull-request list answers *was it reviewed* and *what did it cost*, but not *what did the
review find*. Triaging several pull requests means opening each one to learn whether a score
comes from three cosmetic suggestions or one critical finding — situations that can produce a
similar number and demand opposite responses.

The findings exist server-side by the time a row renders. The list does not carry them, so
triage costs one page load per pull request.

## Goals / Non-goals

**Goals**

- Show, per pull request, how its latest review's findings break down by severity.
- Let a reader see enough of them to decide whether to open it, without leaving the list.
- Keep the list to a single request however many rows it has.

**Non-goals**

- Acting on a finding from the list. Accept, reject and reply stay on the pull-request page,
  where the whole finding is visible.
- Filtering or sorting the list by severity.
- Aggregating across runs — see *Which run*.
- The in-run severity counters and filter — a separate, client-only spec.

## Which run

The column reports the **latest completed review**, not a total across runs:

- The required heading names a single run, and a preview mixing runs would show findings the
  count does not cover.
- It matches the neighbouring score, which is also the latest review's. A row whose score and
  findings described different runs would contradict itself.

This differs from the cost column, which sums every completed run — deliberately. Cost is a
question about the pull request ("what has this cost"); findings are a question about a review
("what did this run say").

## User stories

- As a reviewer scanning the list, I want each row's severity breakdown, so that I open the
  pull request that needs me rather than the one at the top.
- As a reviewer, I want a finding's gist without leaving the list, so that triage costs one
  page instead of many.
- As a reviewer, I want the preview to be unmistakably read-only, so that I never half-act on
  something I have only skimmed.

## Acceptance criteria (EARS)

**The column**

- **AC-1** — WHILE the list is displayed, the system SHALL show, for each pull request whose
  latest completed review produced at least one finding, one icon-and-count pair per severity
  present in that review.
  _(observable: a row whose latest review found 2 criticals and 2 warnings shows two pairs)_
- **AC-2** — IF a pull request has no completed review, or its latest produced no findings,
  THEN the system SHALL show a placeholder mark.
- **AC-3** — The column SHALL sit between the score and status columns.

**The preview**

- **AC-4** — WHEN a reader points at the icon group, the system SHALL open a panel headed
  `N FINDINGS IN THIS RUN`, N being the review's full count.
  _(observable: six findings head the panel `6 FINDINGS IN THIS RUN`, and N matches the icon
  counts. The wording is fixed: the mockup's shorter `6 FINDINGS` drops which run is described,
  which is the one thing the heading exists to say)_
- **AC-5** — Each entry SHALL show six things and only these: the severity icon, the title, the
  category, the cited file and line, the confidence as a percentage, and an abbreviated
  description.
- **AC-6** — The panel SHALL NOT render any control that changes state — no accept, no reject,
  no reply, no edit.
- **AC-7** — The panel SHALL list every finding of the review, ordered by descending severity
  then descending confidence, and SHALL scroll when they do not fit.
  _(observable: a 12-finding review shows all 12 under a heading reading 12 — the reader
  scrolls rather than being told there is more somewhere else. Nothing is withheld: a preview
  that hides the finding someone is looking for sends them to open the pull request anyway,
  which is the cost this column exists to remove)_
- **AC-8** — The system SHALL abbreviate each description to at most 160 characters, ending an
  abbreviated one with an ellipsis.
  _(observable: about two lines at the panel's width — past that it stops being a preview, and
  a long hostile string cannot dominate the page)_
- **AC-9** — The system SHALL render the cited file and line as text, not as a link.
  _(observable: nothing in the panel navigates; the criterion asks for text only, and a link
  would be a navigation target built from attacker-influenced input)_
- **AC-10** — WHEN the reader stops pointing at the group, the system SHALL close the panel.
- **AC-11** — The icon group SHALL be reachable by keyboard, SHALL open the panel on focus, and
  SHALL close it on Escape.
  _(observable: usable without a pointing device, which hovering alone is not)_
- **AC-12** — The system SHALL render every finding-derived string as plain text.
  _(observable: markup in a title or description appears literally, as characters)_

**Cost of the interaction**

- **AC-13** — The system SHALL deliver every row's counts and previews in the same response
  that delivers the list.
  _(observable: opening the list and every preview on it issues exactly one request)_
- **AC-14** — WHEN the list is rendered or a preview opened, the system SHALL NOT invoke a
  model.

## Edge cases

| Case | Handling |
|---|---|
| Never reviewed | Placeholder → AC-2 |
| Latest review completed with zero findings | Placeholder. accepted: not distinguished from "never reviewed" — the score column already tells those apart, and a second mark for the same distinction is noise |
| An earlier run found problems, the latest none | Placeholder. Follows from *Which run*; intended, not an oversight |
| Latest review still running | Treated as no completed review → AC-2; the row updates when it finishes |
| More findings than fit the panel | All listed, the panel scrolls → AC-7 |
| Touch device, where pointing does not exist | Focus opens the panel → AC-11 |
| A finding citing a path containing markup characters | Rendered literally → AC-12 |
| A description shorter than the limit | Shown whole, no ellipsis → AC-8 |
| The review contains findings a reviewer has already accepted or rejected | Counted and previewable like any other. The heading describes the run, not the current triage state; a run that found six things found six things whatever was later done about them. Triage state lives on the pull-request page, where it can be acted on |

## Non-functional

- The response SHALL carry every finding of each row's latest completed review. Its size
  therefore grows with findings per review, which a single review bounds in practice; it does
  NOT grow with the repository's total findings, because only the latest review of each listed
  row is read.
- The counts and previews for a page of rows SHALL be fetched in a bounded number of queries,
  independent of the row count — no query per row.
- A preview SHALL appear within 100 ms of the pointer arriving, being rendered from data the
  page already holds.

## Cross-module interactions

Two modules, which is why this spec sits at the repository root.

- **API side** — extends the list response with per-row severity counts and a bounded preview;
  owns the "latest completed review" determination and the query bound.
- **Client side** — owns the column, the icon group, the panel, its keyboard behaviour, and
  plain-text rendering.

The shared contract is the boundary, and each side reads it from its own vendored copy. Those
copies are not synchronised automatically.

## Contracts

The list row gains one optional member describing its latest completed review's findings.
Shape, not implementation:

- **counts** — per occurring severity, the number of findings at it. A severity that does not
  occur is absent rather than present with a zero.
- **total** — the review's finding count. It equals `previews.length`; it is carried
  separately so the heading does not have to be computed from the array, and so a future
  decision to bound the array cannot silently change what the heading claims.
- **previews** — an ordered, bounded list; each entry carries severity, title, category, cited
  file, cited line, and confidence as a fraction from 0 to 1.

The member is absent or null when there is no completed review or it produced none; the two are
not distinguished, per the edge cases. Confidence crosses the boundary as the fraction the
contract already uses and becomes a percentage only for display, so the two surfaces cannot
drift apart in rounding.

## Untrusted inputs

**Yes — this feature renders untrusted content in a new place.** A finding's title, description
and cited path derive from model output over pull-request diff content, which an author outside
this repository controls. The panel is the first surface to render them on the list, reachable
without opening any pull request.

- Rendered as plain text, never markup or markdown — AC-12.
- Descriptions abbreviated to a fixed limit — AC-8.
- The cited path is text, not a link — AC-9.

## Open questions

None.
