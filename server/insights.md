# Server insights

Non-obvious findings from working on `@devdigest/api`. Appended by the `engineering-insights` skill. Read on task start; append on task end. See [`.claude/skills/engineering-insights/rubrics.md`](../.claude/skills/engineering-insights/rubrics.md) for what goes in each section.

## What Works

## What Doesn't Work

### multi_agent_runs is declared but never written
**Date:** 2026-11-22
**Evidence:** `server/src/db/schema/runs.ts:41`

The `multi_agent_runs` table and the `agent_runs.multi_agent_run_id` concept are declared for a future milestone but no code writes to them, and `agent_runs` has no FK linking back. Treat the table as absent when aggregating cross-agent data — group by (`pr_id`, `agent_id`) on `agent_runs` directly. Adding a proper batch ID is a pending refactor, not a quick workaround.

## Codebase Patterns

### PR-list cost aggregation: sum latest completed run per distinct agent
**Date:** 2026-11-22
**Evidence:** `server/src/modules/pulls/routes.ts:132`

For each PR, pick the latest `status='done'` run per distinct `agent_id`, then sum their `cost_usd`. If any contributing run has `cost_usd = null`, the PR aggregate is null — don't silently under-report. This mirrors how the list's `score` is derived (latest review per PR), and is the pragmatic stand-in until `multi_agent_runs` becomes the batch primitive.

### Vendored shared contracts drift on comments, not fields — check fields, not files
**Date:** 2026-11-22
**Evidence:** `server/src/vendor/shared/contracts/trace.ts`

`server/src/vendor/shared` and `client/src/vendor/shared` are kept in sync by hand. Running `diff -r` between them is noisy because pre-existing comment drift accumulates (e.g. internal task IDs trimmed on one side). After schema edits, verify sync with `grep -n <new_field_name>` on both copies — field parity is the invariant, byte-for-byte parity isn't.

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

### 2026-11-22 — Run Cost Badge: cost_usd restored on agent_runs; wired through 3 routes
**Date:** 2026-11-22
**Evidence:** `server/src/db/migrations/0010_hesitant_texas_twister.sql`

`cost_usd` (double precision, nullable) was previously dropped in migration `0009_complex_runaways.sql`; migration `0010` restores it. Data was already flowing in `ReviewOutcome` (`reviewer-core`) and in OpenRouter's native `usage.cost` — the gap was pure persistence + serialization. Changes: `completeAgentRun`, `listRunsForPull`, `run-executor.ts` destructure, `RunStats`/`RunSummary`/`PrMeta` contracts, `/pulls` aggregation block.

## Open Questions
