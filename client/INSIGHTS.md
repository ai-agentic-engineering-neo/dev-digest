# client insights

Append-only. One line per finding, at the end of its section:
`- YYYY-MM-DD Fact, the action to take, and why. Applies to path/file.ext:LINE.`

## What Works

## What Doesn't Work

## Codebase Patterns
- 2026-10-05 `RunSummary` (`cost_usd`) and `PrMeta` cost fields were edited in both vendored `shared` copies (client and server); keep them identical or wire parsing drifts. Applies to `src/vendor/shared/contracts/trace.ts:107`.

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes
- 2026-10-05 Added 1 entry to client/INSIGHTS.md (run-cost-badge).

## Open Questions
