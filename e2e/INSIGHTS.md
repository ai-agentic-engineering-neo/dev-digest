# Insights — e2e

Accumulated lessons, non-trivial decisions, traps we've already run into.

Append-only: add to the bottom of the matching section, never rewrite or
delete. A finding that supersedes an older one gets its own dated entry; the
old entry stays. Format — `- YYYY-MM-DD — what is true. What to do or avoid
next time. (path/file.ts:42)`. Written by the `engineering-insights` skill, or
by hand in the same format.

## What Works

## What Doesn't Work

<!--
- 2026-09-18 — example entry: state what turned out to be true, then what to do
  or avoid next time, and point at the evidence. (`path/to/file.ts:42`)
-->

## Codebase Patterns

- 2026-09-21 — flow files assert the seeded finding count as literal text
  (e.g. `wait --text "3 findings"` in `04-pr-findings.flow.json`), so a
  change to `server/src/db/seed.ts`'s findings for PR #482 (adding/removing
  one) must update the matching flow's expected text in the same change, or
  the flow goes stale and starts failing (or worse, passes on an unrelated
  string match) without the DB actually being wrong.
  (`e2e/specs/04-pr-findings.flow.json`)

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
