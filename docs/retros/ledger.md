# Workflow Retro Ledger

One row per `/workflow-retro` run, so multi-agent runs can be compared over time.
Cost uses per-model rates verified via the `claude-api` skill at retro time (rates drift).

| date | label | agents | in→out tok | cache hit | wall | parallelism | cost | top recommendation |
|------|-------|--------|-----------|-----------|------|-------------|------|--------------------|
| 2026-06-30 | spec-project-context | 5 (1+4 nested) | 33k→79k (8.1M cache-read) | 85% | 22.9m | 1.4× | $11.89 | Give spec-creator `Edit` so it revises in place instead of rewriting the whole spec each turn (already fixed) |
| 2026-06-30 | run-plan-project-context | 21 (all depth-1) | 20k→197k (86.5M cache-read) | 95% | ~46m | ~1.4× | ≈$50 (est) | Decide e2e inclusion *before* dispatch — T17 ran ~484s / 20k out / 82 tools, then was fully reverted |
| 2026-07-08 | multi-agent-review (spec→plan→impl→review) | 12 subagents + main loop | 90k→552k (58M cache-read, 3.6M write) | ~94% | API 1h54m (wall 6h55m) | 1.29×† | **$50.01** (Opus $26.13 / Sonnet $23.88; cache-read $20.5 / cache-write $19.0 / output $10.1) | Keep the main-loop [1m] context lean — cache-write is the top line item ($13.75 Opus); also split the overloaded Track C |
<!-- † parallelism is subagent-only (deep analyzer scoped to subagents/); the authoritative $50.01 is from the Claude Code session cost report. An earlier ledger revision used deep-analyzer sums that over-counted cache/input ~1.7–2× and omitted the main orchestrator loop — corrected here. -->

