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
- 2026-09-23 — precise anchor for the entry above, which cited the flow file
  but no line (every entry needs `file:line`): the brittle literal is the
  `wait --text "3 findings"` step at (`e2e/specs/04-pr-findings.flow.json:13`),
  and the same count is restated in prose in the flow's `description` at `:3`
  — a seed change has to update BOTH, since the description is what the next
  reader trusts when deciding whether the assertion is still right.
- 2026-09-23 — the seed coupling now reaches LOCATORS, not just assertions:
  the severity filter chips render `label + count`, so a button's accessible
  name is "Critical 1", and `find role button --name "Critical"` no longer
  identifies it. A UI change that merely appends a number to a label silently
  invalidates every `--name` locator pointing at it, and nothing in
  `pnpm test` catches it — the client unit tests were green while this flow
  would have failed. After changing any user-visible label, grep `e2e/specs/`
  for `--name` and `--text` occurrences of the old string before assuming the
  suite still passes. (`e2e/specs/04-pr-findings.flow.json:11`)

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
