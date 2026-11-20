# INSIGHTS — non-obvious lessons: root (cross-package: scripts/, docs/, CI, docker, contracts between packages)

Append-only log: entries are only ADDED to the end of a section via `node .claude/skills/engineering-insights/scripts/insights.mjs append`; existing ones are never edited or deleted (the guard hook blocks Write/Edit that change text).
Format: `- YYYY-MM-DD · <area> · <fact/symptom> → ALWAYS/NEVER <action>, because <reason> · <evidence: path + symbol / command / error text>` (trailing `[?]` = hypothesis, not yet confirmed).
Selection rules, review and promotion to CLAUDE.md — skill `engineering-insights`. This is a draft under human review, not the truth.

## What Works

## What Doesn't Work

## Codebase Patterns

- 2026-11-20 · .claude/insights guard · guard.mjs only intercepts Write|Edit|MultiEdit, so a shell write (sed -i, >, node fs) to INSIGHTS*.md bypasses append-only silently → NEVER modify INSIGHTS files via Bash except a deliberate, user-approved header change, and ALWAYS diff the body afterwards, because git is the only safety net there · .claude/settings.json PreToolUse matcher, .claude/skills/engineering-insights/hooks/guard.mjs
- 2026-11-20 · run cost · reviewer-core still returns costUsd (OpenRouter usage.cost / PriceBook), but per-run cost was removed from DB, contracts and UI → before re-adding cost, read `git show d45ab0d` for the full touchpoint list, because it spans schema, run.repo, run-executor, both vendor/shared copies, TraceBody, i18n and fixtures · d45ab0d, migration 0009

## Tool & Library Notes

- 2026-11-20 · testcontainers + OrbStack · *.it.test.ts fail with 'Could not find a working container runtime strategy' while `docker info` works, because the default context socket /var/run/docker.sock is absent under OrbStack → run with DOCKER_HOST=unix://$HOME/.orbstack/run/docker.sock TESTCONTAINERS_RYUK_DISABLED=true, because testcontainers reads DOCKER_HOST, not the active docker context · server/test/helpers/pg.ts, reviews.it.test.ts run

## Recurring Errors & Fixes

## Session Notes

## Open Questions
