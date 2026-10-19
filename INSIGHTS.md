# Insights — cross-package
<!-- Append-only, written via the engineering-insights skill
     (.claude/skills/engineering-insights/SKILL.md). Newest on top of each section.
     Entry: - YYYY-MM-DD · <ALWAYS/NEVER/do X> — <why> (<path:line | command>) -->

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes
- 2026-10-19 · Running ANY `pnpm <script>` in server/ or client/ first re-syncs node_modules to the committed pnpm-lock.yaml — locally bumped deps get downgraded (next 15.5.28→15.5.19, drizzle-orm 0.45→0.38, simple-git 4→3); a still-running `next dev` (old version in memory) then regenerates `.next/types` that fail `pnpm typecheck` (`Cannot find name 'LayoutProps'`) — restart dev after such a run, and expect arch:check baseline paths to shift with the drizzle version (server/.dependency-cruiser-known-violations.json)
- 2026-10-18 · NEVER match a Claude Code PreToolUse Bash hook on a plain substring of `tool_input.command` — `echo`, `grep`, heredocs and JSON strings that merely mention `gh pr create` get blocked too (and the whole command with them). Match only a real invocation at a shell-segment start (`^`, `;`, `&&`, `|`, `(`, `$(`, newline, optional `VAR=x` prefixes) (.claude/skills/pr-self-review/scripts/gate.mjs)

## Recurring Errors & Fixes

## Session Notes

## Open Questions
