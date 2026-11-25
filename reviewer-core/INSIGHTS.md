# INSIGHTS — non-obvious lessons: package reviewer-core

Append-only log: entries are only ADDED to the end of a section via `node .claude/skills/engineering-insights/scripts/insights.mjs append`; existing ones are never edited or deleted (the guard hook blocks Write/Edit that change text).
Format: `- YYYY-MM-DD · <area> · <fact/symptom> → ALWAYS/NEVER <action>, because <reason> · <evidence: path + symbol / command / error text>` (trailing `[?]` = hypothesis, not yet confirmed).
Selection rules, review and promotion to CLAUDE.md — skill `engineering-insights`. This is a draft under human review, not the truth.

## What Works

## What Doesn't Work

## Codebase Patterns

- 2026-11-25 · reduce + grounding · neither reduceReviews nor groundFindings dedupes findings, and buildLineIndex lets a second diff entry for the same path overwrite the first's covered lines → when changing map-reduce chunking or the diff parser, dedupe explicitly and keep one diff entry per path, because overlapping chunks otherwise emit duplicate findings that each cost score (scoreFromFindings penalises every copy) · test/reduce.test.ts, test/grounding.test.ts (pinned current behaviour)
- 2026-11-25 · typecheck scope · tsconfig.json includes only src/**, so npm run typecheck never checks test/*.ts and vitest strips types without checking them → typecheck new tests with a throwaway tsconfig that includes test/ (or run tsc on the files) before relying on them, because a wrong fixture type only shows up as a confusing runtime failure · reviewer-core/tsconfig.json include, R1 test session

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
