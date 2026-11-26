# INSIGHTS — e2e

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
- 2026-11-26 · Flows 02/04/05 fail locally but pass in CI (land on the wrong repo): they follow the home redirect to the first repo and assume seeded `acme/payments-api` is the only one, but a dev DB usually has more — run `../scripts/e2e.sh` (isolated, freshly seeded stack). Never reset the dev DB with `docker compose down -v`.

## Session Notes

## Open Questions
