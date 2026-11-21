# Insights — server

Non-obvious lessons for this module. Append-only, newest first inside each section.
Written via the `engineering-insights` skill — see `.claude/skills/engineering-insights/SKILL.md`.

## What Works
<!-- Approaches and solutions that worked here, verified in a session. -->

## What Doesn't Work
<!-- Dead ends and antipatterns: what was tried, why it failed, what to do instead. -->

## Codebase Patterns
<!-- Conventions and architectural decisions the code alone does not make obvious. -->

### 2026-11-21 · New `RunStats` fields need a read-time default; trace jsonb is never migrated
**What:** `run_traces.trace` is a jsonb `RunTrace`. A SQL migration doesn't touch it, so traces saved before a new `RunStats` field existed lack that key. Make the field `.nullish()` in the contract and normalise it in `getRunTrace`, which is how `stats.cost_usd ?? null` is handled. **Why it matters:** Otherwise old runs return `undefined`, and the client breaks or shows wrong values while every new-run test passes. **Where:** `server/src/modules/reviews/repository/run.repo.ts` (`getRunTrace`), `server/src/vendor/shared/contracts/trace.ts` (`RunStats`)

## Tool & Library Notes
<!-- Dependency, tooling, and CI quirks. -->

## Recurring Errors & Fixes
<!-- Exact error text → root cause → fix. -->

## Session Notes
<!-- Dated summaries — only for sessions that produced at least one insight above. -->

## Open Questions
<!-- Unresolved or unverified — not yet safe to act on. -->
