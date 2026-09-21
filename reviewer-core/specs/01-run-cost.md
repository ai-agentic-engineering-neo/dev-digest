# 01 — Run cost: usage reporting (reviewer-core)

Related: [`server/specs/01-run-cost.md`](../../server/specs/01-run-cost.md) (owner of the feature),
[`client/specs/01-run-cost.md`](../../client/specs/01-run-cost.md).

## Goal

Let the caller see **every** LLM response's usage (tokens + USD) as it happens, so a
run that fails or is cancelled can still record what it spent. Today usage only comes
back in the successful `ReviewOutcome` / `StructuredResult`. When an error is thrown,
the totals accumulated in `reviewPullRequest` (earlier map-reduce chunks) and in
`completeStructured` (schema-invalid retry attempts) are lost.

## Scope

- `ReviewInput.onUsage?: (u: LlmUsage) => void`. `reviewPullRequest` passes it
  unchanged into every `llm.completeStructured({ …, onUsage })` call. `LlmUsage` and
  `StructuredRequest.onUsage` come from `@devdigest/shared` (the server vendor copy).
- `llm/openrouter.ts` `completeStructured`: right after each response and before
  parsing, call `req.onUsage?.({ tokensIn, tokensOut, costUsd })` with **this attempt's**
  numbers, where `costUsd = usage.cost ?? estimateCost?.(model, in, out) ?? null`.
  The cumulative return value keeps working as it does today.
- Export nothing new from `src/index.ts` beyond the types that `ReviewInput` already
  pulls in. `LlmUsage` lives in shared.

## Invariants

- `onUsage` is **observational**. It never changes control flow, and an exception
  thrown inside it must not break the review. Wrap the call in `try/catch` and ignore
  the error.
- For a successful review: `Σ onUsage.tokensIn === outcome.tokensIn`, the same holds for
  `tokensOut`, and the cost sum equals `outcome.costUsd` (or both are `null`).
- The engine stays pure: no persistence, only the callback.
- Error-response attempts (HTTP 4xx/5xx, no `usage`) emit nothing.

## Out of scope

- Timeouts and aborted requests: no response means no usage.
- The `complete()` (non-structured) path.

## Acceptance criteria

1. `run.test.ts`: in map-reduce with a fake LLM whose 2nd chunk throws, `onUsage` is
   called once for chunk 1 and `reviewPullRequest` rejects.
2. `run.test.ts`: on success, the sum of `onUsage` deltas equals the outcome totals.
3. An OpenRouter provider test (fetch mocked): 1 invalid + 1 valid attempt produces
   2 `onUsage` calls with per-attempt values. 3 invalid attempts produce 3 calls and then throw.
4. An `onUsage` that throws does not fail the review.
5. `npm run typecheck` + `npm test` pass, and the server `pnpm typecheck` still passes.

## Implementation plan

1. Server vendor `adapters.ts`: `LlmUsage` + `onUsage`. This is shared with the server spec, step 1.
2. `review/run.ts`: add the field to `ReviewInput` and forward it through the `completeStructured` call.
3. `llm/openrouter.ts`: emit per attempt, guarded by `try/catch`.
4. Tests from the acceptance criteria.
