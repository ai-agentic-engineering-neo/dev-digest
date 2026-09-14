# Insights — e2e

Read before starting work here; append before finishing — see [`engineering-insights`](../.claude/skills/engineering-insights/SKILL.md) for the rubrics and the anti-vague test. Newest entry on top within each section. Append-only: correct a stale entry with a new dated note, never rewrite or delete it.

## Pattern

## Mistake

### 2026-09-14 — `pnpm typecheck`/`pnpm install` here creates a stray pnpm lockfile — this package uses npm
`e2e/package-lock.json` is the real, committed lockfile (`.github/workflows/e2e-web.yml` runs `npm ci` for this package, unlike `server`/`client` which use `pnpm install --frozen-lockfile`). Running `pnpm typecheck` (or any `pnpm` command) here auto-installs via pnpm and drops a `pnpm-lock.yaml`/`pnpm-workspace.yaml` plus a pnpm-shaped `node_modules` next to the npm one — both untracked, both wrong. Habit-carryover risk since every other package in this repo (`server`, `client`, `reviewer-core`... check first) does use pnpm. Use `npm run typecheck` / `npm test` here, and `git status` after touching this dir to catch stray pnpm artifacts before they get committed.

## Decision

## Context

## Open Questions
