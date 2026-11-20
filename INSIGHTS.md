# INSIGHTS — non-obvious lessons: root (cross-package: scripts/, docs/, CI, docker, contracts between packages)

Append-only log: entries are only ADDED to the end of a section via `node .claude/skills/engineering-insights/scripts/insights.mjs append`; existing ones are never edited or deleted (the guard hook blocks Write/Edit that change text).
Format: `- YYYY-MM-DD · <area> · <fact/symptom> → ALWAYS/NEVER <action>, because <reason> · <evidence: path + symbol / command / error text>` (trailing `[?]` = hypothesis, not yet confirmed).
Selection rules, review and promotion to CLAUDE.md — skill `engineering-insights`. This is a draft under human review, not the truth.

## What Works

## What Doesn't Work

## Codebase Patterns

- 2026-11-20 · .claude/insights guard · guard.mjs only intercepts Write|Edit|MultiEdit, so a shell write (sed -i, >, node fs) to INSIGHTS*.md bypasses append-only silently → NEVER modify INSIGHTS files via Bash except a deliberate, user-approved header change, and ALWAYS diff the body afterwards, because git is the only safety net there · .claude/settings.json PreToolUse matcher, .claude/skills/engineering-insights/hooks/guard.mjs

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
