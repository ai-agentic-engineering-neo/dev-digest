# Insights — e2e

Maintained via the `engineering-insights` skill (`.claude/skills/engineering-insights/SKILL.md`); entry format and rules live there.

## What Works
<!-- approaches and solutions that proved effective here -->

## What Doesn't Work
<!-- dead ends and antipatterns, each with why it failed; the most valuable section -->

## Codebase Patterns
<!-- unwritten conventions and architectural decisions, with the reason -->

## Tool & Library Notes
<!-- dependency quirks, version-specific behaviour, CLI gotchas -->
- **Match `wait --text` against the rendered text, not the i18n string** — CSS `text-transform: uppercase` on list headers makes `wait --text Cost` time out while `COST` passes. Evidence: `client/src/app/repos/[repoId]/pulls/styles.ts:105`; `✗ PR list has the COST column — Command failed: agent-browser wait --text Cost`. (2026-11-20)

## Recurring Errors & Fixes
<!-- exact error text → cause → fix -->
- **`mise ERROR agent-browser is not provided by the active node@…` → every flow fails at `agent-browser open`** — the global CLI was installed under another node version than the one providing pnpm, and `mise exec node@<old>` breaks pnpm instead. Fix: symlink `$(mise where node@<version-with-agent-browser>)/bin/agent-browser` into a dir prepended to `PATH`, then run `./scripts/e2e.sh`, or reinstall agent-browser for the active node. Evidence: `agent-browser open about:blank`; `0/7 flows passed`. (2026-11-20)

## Session Notes
<!-- one dated line per session that produced an entry above -->
- 2026-11-20 — cost badge e2e step → CSS-uppercase text match, agent-browser node-version workaround, 05 flake question.

## Open Questions
<!-- unverified hypotheses and unresolved items; move out once answered -->
- **`05-pr-diff` flakes on `find text … click` right after `wait --url /pulls`** — failed once and passed 3 times on an unchanged flow. It probably needs a `wait --text <title>` before the click, as `02` does. Unverified. (2026-11-20)
