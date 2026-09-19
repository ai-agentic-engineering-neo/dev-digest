# Insights — server

Non-obvious, file-grounded findings that reading the code does not reveal.
Written and maintained through the `engineering-insights` skill, which carries the format,
the section rules and the quality bar.

## What Works

## What Doesn't Work

**2026-09-19** — The seeded PR #482 cannot exercise the reviewer: its `pr_files` rows carry real
`additions`/`deletions` but `patch` is an empty string, so the list shows a convincing `M · 285`
across 9 files while the agent receives no diff at all. A run against it completes green with 0
findings and score 100, which reads as "the reviewer works" when nothing was reviewed. Import a real
repository before validating anything that depends on findings, grounding or scores.
Evidence: server/src/db/seed.ts

## Codebase Patterns

**2026-09-19** — A review run's prompt gets `repoMap` and `callers` but never `skills`, `memory` or
`specs`: `run-executor.ts:201-203` fills only the first two, and the trace literal hardcodes the
rest to null. The reviewer therefore knows the repo's *structure* (1494 tokens of skeleton, visible
in the run log) but none of its *rules* — it cannot flag a CLAUDE.md convention such as
`Schema.parse(req.body)` inside a handler, because nobody shows it the convention. Confirmed by
running a reviewer against a PR that violates that rule: three general findings, zero project ones.
Evidence: server/src/modules/reviews/run-executor.ts:201

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

**2026-09-19** — `RunStats` is read out of the `run_traces` jsonb document, `RunSummary` off a
column, and that is why their `cost_usd` fields differ: `nullish` for the first, `nullable` for the
second. A document written before a field existed simply has no key, so the contract has to admit
`undefined`; a column the server always serialises does not. Rejected making both `nullable` for
symmetry — it type-checks and then lies about every trace older than the field.
Evidence: server/src/vendor/shared/contracts/trace.ts:65


## Open Questions
