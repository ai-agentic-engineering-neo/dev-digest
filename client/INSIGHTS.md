# Insights — client

Maintained via the `engineering-insights` skill (`.claude/skills/engineering-insights/SKILL.md`); entry format and rules live there.

## What Works
<!-- approaches and solutions that proved effective here -->

## What Doesn't Work
<!-- dead ends and antipatterns, each with why it failed; the most valuable section -->

## Codebase Patterns
<!-- unwritten conventions and architectural decisions, with the reason -->
- **Change the web port in `client/package.json` (`next dev -p` / `next start -p`), not in `client/.env`** — no client code reads `WEB_PORT`; `client/.env` keeps it only to mirror `server/.env`, where it sets the API's CORS origin. Keep all three equal. Evidence: `client/package.json:7`; `grep -rn WEB_PORT client` hits only `.env*` and CLAUDE.md. (2026-11-19)

## Tool & Library Notes
<!-- dependency quirks, version-specific behaviour, CLI gotchas -->

## Recurring Errors & Fixes
<!-- exact error text → cause → fix -->

## Session Notes
<!-- one dated line per session that produced an entry above -->
- 2026-11-19 — moved web port to 13000 → `WEB_PORT` is not read by Next.

## Open Questions
<!-- unverified hypotheses and unresolved items; move out once answered -->
