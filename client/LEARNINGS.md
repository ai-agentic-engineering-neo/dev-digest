# client — engineering learnings

**While working:** append only. Read the file before writing — if the lesson
is already here, extend that entry instead of adding a second copy. If one
turns out wrong, add a new entry correcting it rather than editing history.

**During a scheduled review** (quarterly, or when this file stops being
useful): merge duplicates, delete entries about code that no longer exists,
and resolve contradictions explicitly — two entries giving opposite advice
make the agent pick at random. Treat this file as a draft under review, not
as truth; a bad entry is worse than a missing one.

## What Works

### 2026-07-28 — money formatting here needs significant digits, not fixed decimals

Real run costs in this app are ~$0.0004–$0.02 (verified against `agent_runs`
on the dev DB). Any fixed-decimal formatter renders nearly all of them as
"$0.00" — which is exactly what the pre-`d45ab0d` helper did
(`usd.toFixed(2)`). A magnitude ladder isn't enough either: capping at 4
decimals turns $0.00039347 into "$0.0004", one significant digit.

`formatCost` in `src/lib/format.ts` uses `toPrecision(3)` for sub-dollar
values, trims trailing zeros (so 0.012 → "$0.012", not "$0.0120"), and pads
back to 2 decimals when trimming leaves fewer (0.1 → "$0.10"). Values ≥ $1
use plain `toFixed(2)`. Keep `null` → "—" strictly distinct from `0` →
"$0.00": null means no completed run / unknown pricing, and showing a price
there is the bug the whole format exists to prevent.

## What Doesn't Work

## Codebase Patterns

### 2026-07-29 — filter chips must count the list they filter, not the raw prop

`FindingsPanel` composes two independent filters: `hideLow` (confidence) and
severity. Counting from the `findings` prop would show "1 SUGGESTION" while
that card is hidden by hide-low-confidence — the number and the list
disagree, and the chip becomes a lie.

The order that keeps them honest, in `FindingsPanel.tsx`:
`visibleFindings(findings, hideLow)` → `countBySeverity(visible)` →
`bySeverity(visible, severity)`. Counts sit *between* the two filters, so
every chip's number equals exactly what clicking it yields.
`countBySeverity` also drops zero-count severities — a chip that filters to
an empty list is a dead end.

Reset `focusIdx` to 0 whenever either filter changes. j/k navigation
otherwise points past the end of the narrowed list and the focus ring
silently vanishes.

### 2026-07-28 — run usage reaches the verdict banner via `prRuns`, not `ReviewRecord`

`ReviewRecord` (`vendor/shared/contracts/review-api.ts`) carries `run_id` but
no tokens/cost — that data lives on `RunSummary`, fetched separately by
`usePrRuns(prId)` on the PR detail page. `FindingsTab` already receives
`prRuns` for the Timeline but historically passed only `review` down to
`ReviewRunAccordion`.

To put run stats on `VerdictBanner`, build a `Map` keyed by `run_id` from the
`prRuns` the page already has and thread the matched fields down
(`FindingsTab` → `ReviewRunAccordion` → `VerdictBanner`) — no new server join
onto `reviewsForPull` needed. Gate rendering on `status === "done"`, matching
the `settled` check `RunHistory.tsx` already applies before showing
score/findings on a run row.

### 2026-07-28 — `vendor/shared` copy has already drifted from server's

`src/vendor/shared` here is an independent copy of `server/src/vendor/shared`,
not auto-synced — it's already missing fields/types the server copy has
(`sessionId`, the `openrouter` provider id, `CommitFile`/`CommitFilesPayload`).
Editing a shared contract only here does not reach the server; the server
keeps stale types and still type-checks clean.

## Tool & Library Notes

### 2026-07-29 — `borderColor` is a shorthand too, and clashes with `borderLeftColor`

`FindingCard/styles.ts` carried a comment warning "never mix `border`
shorthand with `borderLeft`" — right advice, but it missed its own case.
`borderColor` is *itself* shorthand for the four side colours, so having it
alongside `borderLeftColor` makes React warn: *"Updating a style property
during rerender (borderColor) when a conflicting property is set
(borderLeftColor)"*.

It only fires when the value actually changes mid-life — here `focused`
flipping. It sat dormant until the severity filter (which resets focus on
every filter change) made it fire on every test click.

Fix: set `borderTopColor` / `borderRightColor` / `borderBottomColor`
explicitly and leave `borderLeftColor` as the accent. `transition:
border-color` still animates all four.

## Recurring Errors & Fixes

### 2026-07-28 — PR-list columns live in three places that must stay in sync

Adding a column to the PR list means editing `COLUMN_KEYS` *and* `GRID` in
`src/app/repos/[repoId]/pulls/constants.ts` — `GRID` is a
`grid-template-columns` string whose track count must match `COLUMN_KEYS`
length, and it's consumed by both `s.headRow` and `s.row` in `styles.ts`. Add
the cell to `PRRow.tsx` in the same ordinal position, plus a label under
`list.columns` in `messages/en/prReview.json`. Miss the `GRID` track and the
header/row cells silently shear apart by one column with no error.

Testing note: asserting `getByText("—")` on a PR row is ambiguous — the
Updated cell renders "—" too whenever `updated_at` is null (`relativeTime`).
Give the fixture a real `updated_at` so the em dash under test is unique.

## Session Notes

## Open Questions

### 2026-07-28 — `formatTokens` is coarse below 1K

`formatTokens` renders in thousands with one decimal, per the spec'd
"8.2K→1.3K" format. Typical completion sizes here are small (125 tokens →
"0.1K"), so the out-side is often near-meaningless. Left as-is to match the
agreed format; revisit if the token figures are meant to be read precisely
rather than as a magnitude.
