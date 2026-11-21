# Insights

Lessons learned in this package: traps, non-obvious behaviour, approaches that
failed and why. Read before changing non-trivial code here. Maintained by the
`engineering-insights` skill (`.claude/skills/engineering-insights/SKILL.md`).
Append-only: newest at the bottom of each section. Corrections go in as
`> **Superseded YYYY-MM-DD:** …`, never as deletions.

Entry format (Session Notes and Open Questions are `- YYYY-MM-DD — …` one-liners):

```
### YYYY-MM-DD — short imperative title
**Insight:** symptom + root cause — what is non-obvious
**Rule:** ALWAYS/NEVER <action> — because <reason>
**Evidence:** path/to/file.ts → symbolName() | test name | command
```

Only add an entry if it is non-obvious from reading the code, specific, and
actionable cold.

---

## What Works

## What Doesn't Work

## Codebase Patterns

### 2026-11-21 — [REVIEW NEEDED] Run cost is computed per LLM call but never persisted
**Insight:** reviewer-core returns `costUsd` per run, but `run-executor.ts` keeps only tokensIn/tokensOut and `agent_runs` has no cost column; the static fallback price table has no current Claude model IDs, so `estimateCost()` returns null for them.
**Rule:** ALWAYS derive run cost from `agent_runs.model` + tokens via `container.priceBook.estimate()` and refresh `adapters/llm/pricing.ts` when agents switch models — because unknown models silently price as null/$0.
**Evidence:** `server/src/modules/reviews/run-executor.ts` → `completeAgentRun()` call; `server/src/adapters/llm/pricing.ts` → `PRICING`; spec `docs/specs/m1-run-cost/SPEC.md`

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
