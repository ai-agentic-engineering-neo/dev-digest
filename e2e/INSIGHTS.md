# INSIGHTS — non-obvious lessons: package e2e

Append-only log: entries are only ADDED to the end of a section via `node .claude/skills/engineering-insights/scripts/insights.mjs append`; existing ones are never edited or deleted (the guard hook blocks Write/Edit that change text).
Format: `- YYYY-MM-DD · <area> · <fact/symptom> → ALWAYS/NEVER <action>, because <reason> · <evidence: path + symbol / command / error text>` (trailing `[?]` = hypothesis, not yet confirmed).
Selection rules, review and promotion to CLAUDE.md — skill `engineering-insights`. This is a draft under human review, not the truth.

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes

- 2026-11-25 · find … click race · 'Command failed: agent-browser find text <row> click' right after 'wait --url /pulls' (flows 04/05) while flow 02 passes: find does not wait for the element, and locally the PR list loads slower because the API first tries a GitHub sync with the real token in ~/.devdigest/secrets.json (404 + retries for the demo repo) → ALWAYS put a 'wait --text <same text>' step before any 'find … click' on async data, because CI (no token) is fast enough to hide the race · specs/04-pr-findings.flow.json, specs/05-pr-diff.flow.json

## Session Notes

## Open Questions
