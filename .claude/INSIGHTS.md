# Insights — harness

Non-obvious findings about this repo's agent setup itself: skills, hooks, `CLAUDE.md` wiring,
settings. Scoped to `.claude/` the way each package's file is scoped to its package — not a
catch-all for findings that belong to `server/`, `client/`, `reviewer-core/` or `e2e/`, and not a
place for Claude Code behaviour that is the same in every repository.

Written and maintained through the `engineering-insights` skill, which carries the format,
the section rules and the quality bar.

## What Works

**2026-09-18** (refined 2026-09-19) — Skill descriptions in this repo are written in English while
the work is requested in Russian, and auto-triggering still fires: the anchor that matches is the
path name (`server/`, `client/`), which carries across languages. Confirmed by a Russian request
loading `engineering-insights` with no slash command, and by a rename request correctly not loading
it. Anchor a new skill's description on paths and filenames rather than on words that have to be
translated. The boundary: a path anchor only fires while the user is still naming paths. Through a
multi-turn feature ("make the feature", "check it", "carry on") no message contained one, and the
skill stayed silent for the whole task — it has to be invoked by hand once a session moves past its
opening request. Evidence: .claude/skills/engineering-insights/SKILL.md:3

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

**2026-09-21** — "The skill fires without an explicit request" (criterion 9) has two distinct
satisfying mechanisms, not one: the skill description matching the request's own wording (the
2026-09-18 entry above), and the root `CLAUDE.md` session-protocol section, which told this session
to invoke `engineering-insights` by hand at the start of package work. Both count toward the
criterion — it is worded around the absence of a user request for the skill, not around which
mechanism raised it — but only the first is evidence of description-based auto-triggering. When
reporting which one fired, name the mechanism rather than calling a CLAUDE.md-driven invocation an
invalid measurement. Evidence: CLAUDE.md (## Session protocol).

## Open Questions
