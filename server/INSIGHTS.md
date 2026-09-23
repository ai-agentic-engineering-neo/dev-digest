# Insights — server

Accumulated lessons, non-trivial decisions, traps we've already run into.
Covers `src/modules/repo-intel` too — it lives inside this package.

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

- 2026-09-20 — `src/vendor/shared` is canonical but hand-mirrored into
  `client/src/vendor/shared`; each package compiles against its own copy, so a
  field added to only one side compiles clean on the server and fails in the
  client with a confusing "two unrelated types" error. ALWAYS apply a contract
  change to both files in the same commit, then `diff` the touched region to
  confirm they match. (`server/src/vendor/shared/contracts/trace.ts:61`)
- 2026-09-20 — the review result reaches the DB through a hand-written
  projection: `ReviewOutcome` is destructured in the executor and its fields are
  passed field-by-field to `completeAgentRun`. A field the destructuring omits
  is silently dropped — no type error, no test failure — which is exactly how
  `costUsd` was computed for months and never persisted. When adding anything
  observable, diff `ReviewOutcome`'s shape against the `completeAgentRun` call
  rather than trusting the types. (`server/src/modules/reviews/run-executor.ts:213`)
- 2026-09-21 — pure, unit-tested rollup/derivation helpers for the PR list can
  sit in `pulls/status.ts` well ahead of any route actually calling them —
  `rollupSeverities()`/`SeverityCounts` had full test coverage but zero
  callers until the FINDINGS-column feature wired them into
  `GET /repos/:id/pulls`. Its keys were lowercase (`critical`/`warning`/
  `suggestion`) and had to be changed to uppercase to match the wire
  `Severity` enum before use — check this file for an existing helper before
  writing a new rollup over `findings`/`reviews`. (`server/src/modules/pulls/status.ts:16`)
- 2026-09-21 — `GET /repos/:id/pulls`'s `findings_preview` (the PR-list
  FINDINGS-column hover popover) was originally capped at 6 findings
  (`FINDINGS_PREVIEW_LIMIT`), reasoned as "it's a separate network payload,
  keep it small". User testing on a real 15-finding review showed this reads
  as broken, not intentional — the popover scrolls, so a silent "6 of 15"
  truncation just looks like scrolling stopped working. Corrected: the
  preview is NOT capped, matching the PR-detail Timeline's popover (which
  already showed every finding of a run, unlimited). A review's finding
  count is small and text-only, so sending it all is cheap — don't
  reintroduce a cap here without a concrete payload-size problem to justify
  it. (`server/src/modules/pulls/routes.ts:133`)

## Tool & Library Notes

## Recurring Errors & Fixes

- 2026-09-21 — `seed.ts`'s PR #482 review+findings block only runs inside
  `if (!pr)` (`db:seed`'s "idempotent" claim covers workspace/user/settings,
  not this fixture). Re-running `pnpm db:seed` against a DB that already has
  PR #482 will NOT add findings appended to that block in code — the review
  row already exists so the insert is skipped entirely. To see a new seeded
  finding on an existing dev DB, insert it by hand (or drop the PR's review
  row) rather than just re-seeding. (`server/src/db/seed.ts:99`)

## Session Notes

## Open Questions
