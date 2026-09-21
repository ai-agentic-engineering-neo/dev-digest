# Insights — server

Lessons learned in `server/` that the code doesn't tell you. Written by the
`engineering-insights` skill via `.claude/skills/engineering-insights/scripts/append_insight.py`.
**Append only** — new bullets go on top of a section; existing lines are never changed by agents.
Format: `- YYYY-MM-DD — <where>: <fact> → <action>`.
Reviewed monthly: stale entries are removed in a dedicated commit.

## What Works
<!-- approaches and solutions that worked here -->

## What Doesn't Work
<!-- dead ends and anti-patterns — the most valuable section -->

## Codebase Patterns
<!-- conventions and architectural decisions not obvious from the code -->

## Tool & Library Notes
<!-- dependency quirks, versions, flags -->
- 2026-09-21 — test/*.it.test.ts (Testcontainers): the first run on a machine pulls pgvector/pgvector:pg16 inside beforeAll and hits the 120s hookTimeout, so every test shows as skipped → run `docker pull pgvector/pgvector:pg16` once first. pnpm may be missing on WSL PATH → `npx -y pnpm@10 <cmd>` works without a global install

## Recurring Errors & Fixes
<!-- error message → cause → fix -->
- 2026-09-21 — src/platform/sse.ts + run-executor.ts: 'Cancel does nothing, run ends as done' → RunBus.complete() cleared the cancel flag that cancelRun had just set, and there was no checkpoint after the engine's last LLM call → fixed in ac92ce5 (sticky flag + post-engine checkpoint); the 2026-09-21 Open Question about cancel is resolved. Cancel through POST /runs/:id/cancel in tests (test/run-cancel.it.test.ts)

## Session Notes
<!-- YYYY-MM-DD — one-line summary of a meaningful session -->

## Open Questions
<!-- what is still unresolved -->
- 2026-09-21 — src/platform/sse.ts RunBus.complete() deletes the run from the cancelled set, and ReviewService.cancelRun calls cancel() then complete() back-to-back → POST /runs/:id/cancel never stops a LIVE run: the engine never sees isCancelled, and the executor's final completeAgentRun overwrites status 'cancelled' with 'done' (verified 2026-09-21 in reviews.it.test). Tests signal app.container.runBus.cancel(runId) directly; the fix is pending a decision
