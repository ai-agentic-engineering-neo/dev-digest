# Insights — reviewer-core/

Durable findings discovered while working in this package that aren't
obvious from the code or `README.md`. Append-only: correct a stale entry
with a dated note beneath it rather than editing it away. Sections are
fixed — add to the one that fits, never invent a new heading. Written and
read by the `engineering-insights` skill.

## Decisions

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

- **2026-09-18** — Unlike `server/` and `client/`, this package has no
  committed `pnpm-lock.yaml`. Running `pnpm install` here generates a fresh
  one from `package.json` — don't `git add` it, it isn't part of this
  repo's tracked state.

## Recurring Errors & Fixes

## Session Notes

## Open Questions
