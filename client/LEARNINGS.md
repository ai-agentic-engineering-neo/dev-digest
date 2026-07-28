# client — engineering learnings

Append-only. Never rewrite or delete a past entry — if one turns out wrong,
add a new entry correcting it.

## What Works

## What Doesn't Work

## Codebase Patterns

### 2026-07-28 — `vendor/shared` copy has already drifted from server's

`src/vendor/shared` here is an independent copy of `server/src/vendor/shared`,
not auto-synced — it's already missing fields/types the server copy has
(`sessionId`, the `openrouter` provider id, `CommitFile`/`CommitFilesPayload`).
Editing a shared contract only here does not reach the server; the server
keeps stale types and still type-checks clean.

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
