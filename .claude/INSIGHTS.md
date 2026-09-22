# Insights — harness

Non-obvious findings about this repo's agent setup itself: skills, hooks, `CLAUDE.md` wiring,
settings. Scoped to `.claude/` the way each package's file is scoped to its package — not a
catch-all for findings that belong to `server/`, `client/`, `reviewer-core/` or `e2e/`, and not a
place for Claude Code behaviour that is the same in every repository.

Written and maintained through the `engineering-insights` skill, which carries the format,
the section rules and the quality bar.

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

**2026-09-21** — "The skill fires without an explicit request" (criterion 9) has two distinct
satisfying mechanisms, not one: the skill description matching the request's own wording, and the
root `CLAUDE.md` session-protocol section, which told this session to invoke
`engineering-insights` by hand at the start of package work. Both count toward the
criterion — it is worded around the absence of a user request for the skill, not around which
mechanism raised it — but only the first is evidence of description-based auto-triggering. When
reporting which one fired, name the mechanism rather than calling a CLAUDE.md-driven invocation an
invalid measurement. Evidence: CLAUDE.md (## Session protocol).

## Open Questions
