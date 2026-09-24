# Insights — e2e

Lessons learned in `e2e/` that the code doesn't tell you. Written by the
`engineering-insights` skill via `.claude/skills/engineering-insights/scripts/append_insight.py`.
**Append only** — new bullets go on top of a section; existing lines are never changed by agents.
Format: `- YYYY-MM-DD — <where>: <fact> → <action>`.
Reviewed monthly: stale entries are removed in a dedicated commit.

## What Works
<!-- approaches and solutions that worked here -->

## What Doesn't Work
<!-- dead ends and anti-patterns — the most valuable section -->
- 2026-09-21 — scripts/e2e.sh:148: the hermetic stack runs a second `next dev` in client/, sharing client/.next with a running dev server, so the dev app on :3000 bakes in NEXT_PUBLIC_API_BASE=:3101 and hangs on skeletons once the hermetic API is torn down → afterwards touch client/src/lib/api.ts (forces recompile with :3001) or restart the dev web; check the browser's Fetch URLs if the UI hangs

## Codebase Patterns
<!-- conventions and architectural decisions not obvious from the code -->
- 2026-09-21 — server/src/db/seed.ts inserts reviews+findings for PR #482 but NO agent_runs rows, so in the e2e stack the Agent runs → Timeline has no run tiles (only commits) → UI on timeline tiles (severity counters, cost, hover popover) cannot be asserted in flows; cover it in RunHistory.test.tsx or seed runs first

## Tool & Library Notes
<!-- dependency quirks, versions, flags -->

## Recurring Errors & Fixes
<!-- error message → cause → fix -->
- 2026-09-21 — scripts/e2e.sh (runner step, e2e/package.json test=tsx run.ts): 'sh: tsx: command not found', exit 127, only after the whole stack has booted → e2e/node_modules is missing; run `npm ci` in e2e/ first. agent-browser not on PATH works via a shim script on PATH: `exec npx -y agent-browser "$@"` (v0.27.0)

## Session Notes
<!-- YYYY-MM-DD — one-line summary of a meaningful session -->

## Open Questions
<!-- what is still unresolved -->
