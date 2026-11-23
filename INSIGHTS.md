# Insights — cross-package

Non-obvious findings for agents working in more than one package, written via the `engineering-insights` skill.
Entries are hints to verify, not rules: if the code disagrees, the code wins — add a `contradicted` comment.
Add only: new entries go last in their section; comments go as indented sub-bullets under the entry they refer to.
Format: `` - YYYY-MM-DD · <insight> — <why>. Evidence: `path` (`symbol`) `` — no line numbers.
Hygiene: monthly `/engineering-insights review` (logged under Review log); split into `INSIGHTS-<domain>.md` past ~100 entries.

## Patterns

## Mistakes
- 2026-11-23 · Drop `2>/dev/null` and other redirects from read-only Bash commands that mention an INSIGHTS file — protect-insights.py treats any `>` as a write and blocks the whole command; split the command instead. Evidence: `.claude/hooks/protect-insights.py` (Bash regex)

## Decisions

## Context
- 2026-11-23 · Hooks added to `.claude/settings.json` mid-session take effect immediately in that session — protect-insights.py blocked an Edit right after the file was created, no restart needed. Evidence: `.claude/settings.json` (PreToolUse)

## Open Questions

## Review log
