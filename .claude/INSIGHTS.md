# Insights — harness

Non-obvious findings about this repo's agent setup itself: skills, hooks, `CLAUDE.md` wiring,
settings. Scoped to `.claude/` the way each package's file is scoped to its package — not a
catch-all for findings that belong to `server/`, `client/`, `reviewer-core/` or `e2e/`, and not a
place for Claude Code behaviour that is the same in every repository.

Written and maintained through the `engineering-insights` skill, which carries the format,
the section rules and the quality bar.

## What Works

**2026-09-22** — Reading past findings is made deterministic by injection, not by instruction:
`SKILL.md:22` carries `` !`cat */INSIGHTS.md .claude/INSIGHTS.md` ``, which runs before the model
sees the skill body, so the files arrive as context rather than as a request the model may skip.
That is why a session can name which entries bear on its task before touching anything.

The cost is that the line must stay ONE literal command. The permission check rejects brace
expansion, `$VAR`, `||` and redirection, so it cannot be made defensive — no fallback, no
alternative path. Two consequences to plan around: the glob `*/INSIGHTS.md` only reaches files one
level deep, so a package nested deeper would be silently skipped; and the `.claude/` path is
spelled out because the glob does not match a dot-directory. Adding a fifth area means editing this
line by hand, and nothing will complain if you forget — the skill will simply read four files and
say nothing about the fifth. Evidence: .claude/skills/engineering-insights/SKILL.md:22

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
