# reviewer-core — structure

## Folders
| Path | Purpose |
|---|---|
| `src/index.ts` | The only public barrel. Re-exports prompt, grounding, structured, reduce, run, to-review, OpenRouterProvider. |
| `src/prompt.ts` | `assemblePrompt`, `wrapUntrusted`, `INJECTION_GUARD`, `MAX_PR_DESCRIPTION_CHARS` (4000). Section order of the user message. |
| `src/grounding.ts` | `buildLineIndex`, `groundFindings`, `groundingSummary` ("3/4 passed"). |
| `src/llm/structured.ts` | `toJsonSchema` (Zod → JSON Schema via `zodResponseFormat`), `extractJson`, `parseWithRepair`. |
| `src/llm/openrouter.ts` | `OpenRouterProvider`: OpenAI SDK pointed at OpenRouter, strict `response_format`, `usage.cost`, `session_id`, retry-on-schema-failure loop. |
| `src/review/run.ts` | `reviewPullRequest`, `ReviewInput`, `ReviewOutcome`, mode selection (single-pass vs map-reduce, threshold 400 lines + multi-file). |
| `src/review/reduce.ts` | `scoreFromFindings`, `reduceReviews`, `sliceDiff`. |
| `src/output/to-review.ts` | `toReviewPayload`, `gateTriggered`, `countBlockers`: GitHub review event from severities + `ci_fail_on`. |
| `test/` | vitest units: `prompt.test.ts`, `run.test.ts`, `to-review.test.ts`. |
| `specs/` | Feature contracts, one per file (`00-cost-usd-contract.md`, template in `specs/README.md`). |

## Entry points
- Library: `src/index.ts`. Runtime: `reviewPullRequest` (`src/review/run.ts`).
- Tests: `vitest.config.ts` includes `test/**/*.test.ts` and `src/**/*.test.ts`; aliases `@devdigest/shared`.
- Type-check doubles as build: `typecheck` and `build` scripts in `package.json` are both `tsc --noEmit`.
- Lint: `eslint.config.mjs` (ESLint 9 flat).

## Reference files
- To see how a prompt section is added and omitted when empty, read `src/prompt.ts` (`assemblePrompt`, `userSections`).
- To see how per-call token and cost numbers are accumulated across chunks, read `src/review/run.ts` lines around `costUsd = costUsd == null || res.costUsd == null ? null : costUsd + res.costUsd`.
- To see how an `LLMProvider` should report `costUsd` and retry on schema failure, read `src/llm/openrouter.ts` (`completeStructured`).
- To see the full pipeline exercised with a fake LLM and a hallucinated finding being dropped, read `test/run.test.ts`.
- To see how the CI gate is derived deterministically, read `src/output/to-review.ts` (`FAIL_ON_MIN_RANK`, `gateTriggered`).
