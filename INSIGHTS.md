# Insights — cross-cutting (multi-module, scripts/, docs/)

Non-obvious learnings, written by the `engineering-insights` skill (see `.claude/skills/engineering-insights/`).
Format: `- YYYY-MM-DD — <what> → <what to do / why> (<file:line | commit>)`. Append-only.
This is a draft under human review: spot-check new lines; once a month prune stale entries and resolve
contradictions. Past ~200 entries, split into domain files (`INSIGHTS-<domain>.md`).
Versioned in git: the history shows how knowledge evolved; revert a bad wrap-up with git.
Imported into CLAUDE.md, so it is loaded every session here — signal over volume.

## What Works

## What Doesn't Work

## Codebase Patterns
- 2026-10-06 — Course material says `LEARNINGS.md` in `apps/*`/`packages/*` → here it is `<module>/INSIGHTS.md` in `server/`, `client/`, `reviewer-core/`, `e2e/` (repo-intel lives in `server/src`) (CLAUDE.md).

## Tool & Library Notes
- 2026-10-06 — A module's CLAUDE.md (and its `@INSIGHTS.md`) loads only after Claude touches files in that folder, not at session start from the root → read `<module>/INSIGHTS.md` explicitly before answering (CLAUDE.md, Documentation loop step 0).
- 2026-10-06 — Once `engineering-insights` is invoked, its PreToolUse hook blocks Write/Edit on every `INSIGHTS*.md` for the rest of the session → do the monthly prune by hand or in a session where the skill wasn't invoked (.claude/skills/engineering-insights/SKILL.md).

## Recurring Errors & Fixes

## Session Notes
- 2026-10-06 — Added `engineering-insights` skill + 7-section INSIGHTS.md template in every module and root; no Stop hook yet (planned for L06), so capture relies on skill auto-trigger + CLAUDE.md rule (.claude/skills/engineering-insights/SKILL.md).

## Open Questions
