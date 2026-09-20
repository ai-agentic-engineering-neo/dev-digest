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

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
