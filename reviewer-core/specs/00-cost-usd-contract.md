# 00 — `costUsd` contract: per-call cost → per-run cost (starter behaviour, Lesson L01 consumer)
Status: done (documents existing behaviour)

## Context
Every structured LLM call reports its USD cost; the engine sums the calls of one review and hands the total
to the caller as `ReviewOutcome.costUsd`. The engine owns **no pricing table**. The server persists the number
on `agent_runs.cost_usd` and exposes it on the PR list, run timeline, and trace (`server/specs/001-run-cost.md`,
`client/specs/001-run-cost-badge.md`).

## Input
- `StructuredResult.costUsd: number | null` returned by the injected `LLMProvider.completeStructured`
  (`server/src/vendor/shared/adapters.ts`).
- Source of that number, in priority order (`src/llm/openrouter.ts`):
  1. OpenRouter `usage.cost` (requested with `usage: { include: true }`), summed over repair attempts;
  2. the injected `estimateCost(model, tokensIn, tokensOut)` callback (server passes `PriceBook.estimate`
     from `server/src/platform/container.ts`, which falls back to the static table in `server/src/adapters/llm/pricing.ts`);
  3. `null` when neither knows the model.
- Server-side providers `server/src/adapters/llm/openai.ts` and `anthropic.ts` use the static `estimateCost` directly.

## Output
- `ReviewOutcome.costUsd: number | null` (`src/review/run.ts`).
- Accumulation rule, one line in `reviewPullRequest`:
  `costUsd = costUsd == null || res.costUsd == null ? null : costUsd + res.costUsd`.
  Starts at `0`; a single `null` chunk makes the whole run `null` and stays `null`.
- Map-reduce mode calls the provider once per file, so the total covers every chunk; single-pass is one call.

## Invariants
- Unknown is `null`, never `0`. `0` means "free model" (e.g. `z-ai/glm-4.7-flash` in `pricing.ts`).
- The engine never reads a price book. Cost attribution is injected or provider-reported.
- `tokensIn`/`tokensOut` are summed independently of cost; they can be non-zero while `costUsd` is `null`.
- A run that throws (cancel, provider error) produces no outcome; the server writes `costUsd: null`
  (`server/src/modules/reviews/run-executor.ts`, failure branch).
- Downstream must preserve `null`: `server/src/modules/pulls/cost.ts` skips unknown runs when summing per PR,
  and `client/src/lib/format-cost.ts` renders `null` as "—".

## How it is tested
- `test/run.test.ts`: the recorder provider returns `costUsd: 0` and the pipeline completes; `MockLLMProvider`
  (`server/src/adapters/mocks.ts`) returns `0.001` per call.
- `server/test/reviews.it.test.ts`: with the mock LLM, `agent_runs.cost_usd` > 0 and equals `trace.stats.cost_usd`
  and `GET /pulls/:id/runs[0].cost_usd`.
- `server/test/pulls-cost.test.ts`: per-PR sum ignores `null` and non-`done` runs.
- `server/test/price-book.test.ts`: live-price cache vs static fallback.
- Gap: no engine test asserts the `null`-propagation rule directly. TODO(verify): add a `run.test.ts` case where
  one map-reduce chunk returns `costUsd: null` and the outcome is `null`.

## Related files
- `src/review/run.ts` · `src/llm/openrouter.ts` · `src/index.ts`
- `server/src/vendor/shared/adapters.ts` (`StructuredResult`) · `server/src/vendor/shared/contracts/trace.ts` (`RunStats.cost_usd`)
- `server/src/platform/price-book.ts` · `server/src/adapters/llm/pricing.ts`
- `server/src/modules/reviews/run-executor.ts` · `server/src/db/schema/runs.ts` (`cost_usd double precision`)
