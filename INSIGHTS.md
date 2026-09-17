# Insights — root (cross-module)

Lessons that span more than one module, or live in tooling, CI and root config.
Module-local lessons go in `<module>/INSIGHTS.md` instead.
Append-only — correct an entry with a dated note beneath it, never by rewriting it.
See `.claude/skills/engineering-insights/`.

## What Works

_No entries yet._

## What Doesn't Work

_No entries yet._

## Codebase Patterns

_No entries yet._

## Tool & Library Notes

### `e2e/` and `reviewer-core/` use npm, not pnpm — running the wrong one litters stray lockfiles (2026-09-18)

`client` and `server` use pnpm (`pnpm-lock.yaml`); `e2e` and `reviewer-core` use npm (`package-lock.json` — see each's `CLAUDE.md` "do not touch"). Running `pnpm typecheck`/`pnpm install` inside `e2e/` or `reviewer-core/` "works" (pnpm happily installs from `package.json`) but silently creates a `pnpm-lock.yaml` + `pnpm-workspace.yaml` next to the real npm lockfile — untracked files that look like legitimate new lockfiles in `git status` and would get committed if not caught.

**Rule:** before running any package-manager command in a module, check which lockfile already exists there (`ls <module>/*lock*`) — don't default to the monorepo's dominant pnpm. If stray `pnpm-lock.yaml`/`pnpm-workspace.yaml` show up in `git status` for `e2e/` or `reviewer-core/`, delete them; `package-lock.json` is the source of truth there. (`e2e/package-lock.json`, `reviewer-core/package-lock.json`)

## Recurring Errors & Fixes

_No entries yet._

## Session Notes

_No entries yet._

## Open Questions

_No entries yet._
