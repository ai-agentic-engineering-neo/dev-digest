# INSIGHTS — client

Non-obvious learnings for this module, maintained by the `engineering-insights` skill.
Read before non-trivial changes. **Append-only**: correct an entry with a dated
`CORRECTION:` bullet below it; don't edit or delete. Promote an entry to `CLAUDE.md`
only if an agent is likely to hit it on most tasks. Prune in a periodic human review
when the file passes ~200 entries.

<!-- Entry: - YYYY-MM-DD · <ALWAYS/NEVER/do X> because <why> — evidence: path/to/file.ts (symbol) -->

## What Works

## What Doesn't Work

## Codebase Patterns
- 2026-11-26 · `client/src/vendor/shared` is a separate copy of `@devdigest/shared` and has already drifted from `server/src/vendor/shared` — when client types disagree with what the API returns, or a contract changes, update both copies and diff them.

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
