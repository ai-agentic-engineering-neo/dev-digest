# reviewer-core — patterns

## 1. Add a prompt slot (a lesson feeds new context to the model)
1. `src/prompt.ts`: add an optional field to `PromptParts` (string or string[]). Untrusted content → wrap with
   `wrapUntrusted('<label>', …)`; trusted curated content (like `memory`) is joined raw.
2. In `assemblePrompt`, push a `## <Section>` block into `userSections` **only when non-empty**, and choose its
   position deliberately (context before `## Diff to review`).
3. Add the slot to the `assembly` object so it lands in the run trace. Then add the matching `.nullish()` field
   to `PromptAssembly` in `server/src/vendor/shared/contracts/trace.ts` (and the client copy).
4. `src/review/run.ts`: add the field to `ReviewInput` and to the `promptParts` object.
5. `test/prompt.test.ts`: pin (a) rendering, (b) omit-when-empty, (c) untrusted wrap, (d) ordering.
6. Run `npm run typecheck` here **and** `pnpm typecheck` in `server/` (alias consumer). The server passes the
   value from `server/src/modules/reviews/run-executor.ts` using the `...(x ? { x } : {})` spread it already uses.

## 2. Add a field to `ReviewOutcome` (something the server should persist)
1. Compute it inside `reviewPullRequest` (`src/review/run.ts`) and add it to the `ReviewOutcome` interface with a doc comment.
2. If it aggregates per-chunk provider data, extend `StructuredResult` in `server/src/vendor/shared/adapters.ts`
   and return it from every provider: `src/llm/openrouter.ts`, `server/src/adapters/llm/openai.ts`,
   `server/src/adapters/llm/anthropic.ts`, `server/src/adapters/mocks.ts`.
3. Assert it in `test/run.test.ts` using `MockLLMProvider` from `server/src/adapters/mocks.ts`.
4. Persist on the server side in `run-executor.ts` (`completeAgentRun` + `trace.stats`). Worked example:
   `specs/00-cost-usd-contract.md`.

## 3. Add or change an `LLMProvider`
1. Implement the `LLMProvider` interface from `@devdigest/shared` (`server/src/vendor/shared/adapters.ts`).
   Only `completeStructured` is required by the engine; `complete`/`embed` may throw `NOT_SUPPORTED` as
   `src/llm/openrouter.ts` does.
2. Use `toJsonSchema(req.schema, req.schemaName)` for strict structured output and `parseWithRepair` to
   validate; on failure push the assistant reply plus `parsed.repromptMessage` and retry up to `req.maxRetries`.
3. Return `tokensIn`, `tokensOut`, `costUsd` (`null` when unknown, never `0`), `raw`, `attempts`.
4. Keep the provider free of a pricing table; accept an `estimateCost` callback like `OpenRouterProviderOptions`.
5. Providers that live here must be exported from `src/index.ts`; the server wires them in
   `server/src/platform/container.ts` (`llm()`).

## Do not
- Add denylist/keyword scanning of untrusted text. Strengthen `INJECTION_GUARD` instead.
- Trust `review.score` from the model or bypass `groundFindings`.
- Read `process.env`, files, or network other than through the injected provider.
