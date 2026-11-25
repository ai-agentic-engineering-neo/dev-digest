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
> **Superseded 2026-11-21:** M1 stores the engine's `costUsd` in `agent_runs.cost_usd` instead of re-pricing on read — see "Read run cost from agent_runs.cost_usd, never re-price".

### 2026-11-21 — Read run cost from agent_runs.cost_usd, never re-price
**Insight:** `reviewPullRequest()` already returns `costUsd` (OpenRouter: real `usage.cost`), and M1 persists it once in `agent_runs.cost_usd`; `run_traces.stats.cost_usd` is a copy that pre-M1 traces lack. `null` means unknown (pre-M1, unpriced model, failed/cancelled) and the UI shows "—", not $0.
**Rule:** ALWAYS take run cost from `agent_runs.cost_usd` (trace route merges it via `withRunCost()`, PR list via one `sum()` group-by) and pass explicit `costUsd: null` in every non-done `completeAgentRun()` — because re-pricing from tokens drifts with prices and treating null as 0 hides unpriced runs.
**Evidence:** `server/src/modules/reviews/repository/run.repo.ts` → `getRunTrace()`, `withRunCost()`; `server/src/modules/pulls/routes.ts` → `costByPr`; test `test/run-cost.it.test.ts`

## Tool & Library Notes

### 2026-11-25 — Keep dependency-cruiser rule regexes flat and unanchored for pnpm
**Insight:** depcruise refuses the whole config with "has an unsafe regular expression. Bailing out." when a `to.path` holds nested quantifiers like `(\.pnpm/[^/]+/node_modules/)?`; under pnpm, packages resolve to `node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>/…`, so `^node_modules/drizzle-orm` never matches.
**Rule:** ALWAYS match packages as unanchored `node_modules/(drizzle-orm|openai|…)/` and set `tsPreCompilationDeps: true` to see `import type` edges (exempt with `dependencyTypesNot: ['type-only']`) — because anchored patterns silently pass every import and nested groups abort the run.
**Evidence:** `.claude/skills/onion-architecture/templates/dependency-cruiser.example.cjs` → `pkg()`; `./node_modules/.bin/depcruise src --config <template> --output-type err`

## Recurring Errors & Fixes

## Session Notes

- 2026-11-21 — M1 run cost (server: column + 4 read paths): done, unit + integration green; see "Read run cost from agent_runs.cost_usd, never re-price"

- 2026-11-25 — onion-architecture skill (rules only, enforcement not wired): template run on server/src reports 34 errors + 5 cycles as starting baseline; see "Keep dependency-cruiser rule regexes flat and unanchored for pnpm"

## Open Questions
