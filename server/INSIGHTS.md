# INSIGHTS — non-obvious lessons: package server

Append-only log: entries are only ADDED to the end of a section via `node .claude/skills/engineering-insights/scripts/insights.mjs append`; existing ones are never edited or deleted (the guard hook blocks Write/Edit that change text).
Format: `- YYYY-MM-DD · <area> · <fact/symptom> → ALWAYS/NEVER <action>, because <reason> · <evidence: path + symbol / command / error text>` (trailing `[?]` = hypothesis, not yet confirmed).
Selection rules, review and promotion to CLAUDE.md — skill `engineering-insights`. This is a draft under human review, not the truth.

## What Works

## What Doesn't Work

## Codebase Patterns

- 2026-11-20 · run-executor · the catch path persists tokensIn/tokensOut = 0 because reviewPullRequest throws without partial usage → stream per-call metrics out of reviewer-core via a callback (like onEvent) if failed/cancelled runs must keep them, because the thrown error carries nothing · run-executor.ts catch block, reviewer-core/src/review/run.ts

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
