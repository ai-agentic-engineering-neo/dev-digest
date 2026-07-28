# client — engineering learnings

Append-only. Never rewrite or delete a past entry — if one turns out wrong,
add a new entry correcting it.

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
