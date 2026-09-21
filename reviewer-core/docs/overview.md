# reviewer-core — overview

## Responsibility
Turn `(unified diff + agent system prompt + optional context slots + injected LLMProvider)` into a
grounded `Review` plus token/cost accounting. Entry point: `reviewPullRequest` in `src/review/run.ts`.

Stages, in order: `assemblePrompt` (`src/prompt.ts`) → `llm.completeStructured` → `reduceReviews`
(`src/review/reduce.ts`) → `groundFindings` (`src/grounding.ts`) → `scoreFromFindings`.

## What it does NOT do
- No database, GitHub, filesystem, or `process.env` access. The only side effect is the injected `llm`.
- No persistence or SSE: `server/src/modules/reviews/run-executor.ts` owns that.
- No pricing table: cost comes from the provider (`usage.cost`) or an injected `estimateCost` callback
  (`src/llm/openrouter.ts`). The server passes its `PriceBook`; a bare provider yields `null`.
- No prompt-injection keyword scanning: the single `INJECTION_GUARD` in `src/prompt.ts` is the defense.
- No repo-intel: `repoMap` and `callers` arrive as pre-rendered strings.

## Dependencies
| Direction | What | Evidence |
|---|---|---|
| in ← `server` | `reviewPullRequest`, `countBlockers`, `OpenRouterProvider`, structured/prompt/grounding helpers | `server/src/modules/reviews/run-executor.ts`, `server/src/platform/container.ts`, `server/src/platform/{prompt,grounding,structured}.ts` |
| out → `@devdigest/shared` | `Review`, `Finding`, `UnifiedDiff`, `LLMProvider`, `PromptAssembly` | `tsconfig.json` paths → `../server/src/vendor/shared`; `vitest.config.ts` alias |
| out → `openai` | OpenAI SDK used as the OpenRouter client and for `zodResponseFormat` | `src/llm/openrouter.ts`, `src/llm/structured.ts` |
| test → `server` | `test/run.test.ts` imports `../../server/src/adapters/mocks.js` | keeps one mock LLM/git for both packages |

The `client/` package never imports this package.

## Public interface
- Exported only from `src/index.ts`. Anything not re-exported there is private.
- Consumed as **source**: `server/tsconfig.json` maps `@devdigest/reviewer-core` → `../reviewer-core/src/index.ts`;
  `server/vitest.config.ts` does the same. There is no build artifact.
- Consequence: CI installs this package's `node_modules` before server jobs (`.github/workflows/server-unit.yml`,
  step "Install reviewer-core deps"), because `openai`/`zod` resolve from here at module load.

## Invariants
- Grounding is mandatory: a finding whose `[start_line, end_line]` misses every hunk of its file is dropped
  (`src/grounding.ts`). Full-file kinds (`secret_leak`, `lethal_trifecta`, `phantom`, `hook`) only need the file present.
- `review.score` is recomputed from surviving findings (`scoreFromFindings`: CRITICAL −35, WARNING −12,
  SUGGESTION −3, clamped 0–100). The model's `score` is ignored.
- `verdict` is passed through from the model (`reduceReviews` takes the worst across chunks).
- Empty optional slots (`skills`, `memory`, `specs`, `callers`, `repoMap`, `prDescription`) are omitted,
  so a starter run's prompt equals the baseline prompt. Pinned by `test/prompt.test.ts`.
- `costUsd` is a sum over chunk calls; one unknown chunk makes the whole run `null` (see `specs/00-cost-usd-contract.md`).
- All untrusted text passes through `wrapUntrusted`, which escapes `</untrusted>`.
- After changing exports, run `server` typecheck too. The alias means a server break shows up only there.
