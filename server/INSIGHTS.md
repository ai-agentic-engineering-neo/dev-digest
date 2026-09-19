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

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
