# INSIGHTS — reviewer-core

Non-obvious learnings for this module, maintained by the `engineering-insights` skill.
Read before non-trivial changes. **Append-only**: correct an entry with a dated
`CORRECTION:` bullet below it; don't edit or delete. Promote an entry to `CLAUDE.md`
only if an agent is likely to hit it on most tasks. Prune in a periodic human review
when the file passes ~200 entries.

<!-- Entry: - YYYY-MM-DD · <ALWAYS/NEVER/do X> because <why> — evidence: path/to/file.ts (symbol) -->

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes
- 2026-11-26 · API crashes at boot with `ERR_MODULE_NOT_FOUND` pointing at a reviewer-core import: the server runs reviewer-core's raw source via a tsconfig alias, so reviewer-core's own deps must be installed — `cd reviewer-core && npm ci` (`scripts/dev.sh` does this when `node_modules` is missing).

## Session Notes

## Open Questions
