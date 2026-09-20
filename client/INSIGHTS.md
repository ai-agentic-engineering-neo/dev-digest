# Insights — client

Accumulated lessons, non-trivial decisions, things we had to learn the hard
way. `CLAUDE.md` links here conditionally — read only when needed, not every
session.

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

## Tool & Library Notes

## Recurring Errors & Fixes

- 2026-09-20 — `pnpm typecheck` failing with "Two different types with this name
  exist, but they are unrelated" on a `@devdigest/shared` type means the
  contract was changed in `server/src/vendor/shared` but not in the client's
  copy (or vice versa) — the named property in the error message is the one
  that drifted. Fix it in `client/src/vendor/shared/contracts/*`, not in the
  component the error points at. (`client/src/vendor/shared/contracts/trace.ts:61`)

## Session Notes

## Open Questions
