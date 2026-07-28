# server — engineering learnings

Append-only. Never rewrite or delete a past entry — if one turns out wrong,
add a new entry correcting it. Covers `server/` and its submodules,
including `server/src/modules/repo-intel` (no separate file for it).

## What Works

## What Doesn't Work

## Codebase Patterns

### 2026-07-28 — `vendor/shared` copies have already drifted

Diffing `server/src/vendor/shared` against `client/src/vendor/shared` shows
they're not identical: server has `sessionId`, the `openrouter` provider id,
`CommitFile`/`CommitFilesPayload` that client's copy lacks. There is no sync
script — editing a shared contract in one copy does not propagate to the
other; the other package keeps stale types and still type-checks clean.

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
