# LLM provider contract, structured output, and cost

The engine never builds a provider itself. It calls
`input.llm.completeStructured` on whatever `LLMProvider` the caller injects.
The contract lives in `@devdigest/shared` (`server/src/vendor/shared/adapters.ts`).

## Contract (the parts the engine uses)

```ts
completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>
// req:    model, schema (Zod), schemaName, messages, maxRetries?, sessionId?, …
// result: data: T, tokensIn, tokensOut, costUsd: number | null, raw, attempts
```

`costUsd: null` means **unknown**, not free. Every provider must return `null`
rather than guess `0`.

## Implementations

| Provider | Lives in | Cost source |
| --- | --- | --- |
| `OpenRouterProvider` | `src/llm/openrouter.ts` (this package, shared with the CI runner) | `usage.cost` from the API, else the injected `estimateCost`, else `null` |
| OpenAI | `server/src/adapters/llm/openai.ts` | static table `estimateCost` (`server/src/adapters/llm/pricing.ts:37`) |
| Anthropic | `server/src/adapters/llm/anthropic.ts` | same static table |

Only OpenRouter lives here, because the CI runner needs it without the server.
The server builds it with an `estimateCost` that uses the live `PriceBook`
(OpenRouter `/models` prices, with the static table as fallback),
`server/src/platform/container.ts:185`. The runner passes none. This keeps the
engine free of any pricing table.

## `OpenRouterProvider.completeStructured`

`src/llm/openrouter.ts:59`:

1. Sends a `response_format: json_schema` request (`strict: true`) with the
   schema produced by `toJsonSchema`. For OpenRouter it also sends
   `session_id` (so all chunks of one review group together in the dashboard)
   and `usage: { include: true }` (so the API returns the real cost).
2. Handles an HTTP 200 **with no `choices`**: OpenRouter reports upstream,
   moderation and free-tier errors in the body. The provider throws with that
   message instead of trying to parse an empty string.
3. Adds `prompt_tokens`, `completion_tokens` and `usage.cost` **across every
   attempt**, so retries are counted in the cost.
4. `parseWithRepair` (`src/llm/structured.ts:54`) first tries `JSON.parse` on
   the raw text, and only then brace/fence extraction. Extraction can be fooled
   by ` ``` ` or `{` inside JSON string values. On failure, the assistant output
   and a reprompt listing the Zod issues are added to the conversation, and the
   next attempt runs.
5. After `maxRetries + 1` attempts it throws
   `"… structured output failed schema validation for <schemaName>"`.

Two retry layers stack up: the OpenAI SDK retries transport errors
(timeout/5xx/429, `maxRetries` 2, `timeoutMs` 90 s by default), and the loop
above retries schema errors.

## Cost across chunks

`reviewPullRequest` starts at `costUsd = 0` and, per chunk
(`src/review/run.ts:184`):

```ts
costUsd = costUsd == null || res.costUsd == null ? null : costUsd + res.costUsd;
```

**One unknown chunk makes the whole run `null`.** A partial sum would be shown
as the real cost and quietly undercount. The UI shows "—" for `null`.

Consequences:
- A map-reduce review on an unpriced model has `null` cost even if most calls
  were priced.
- If the engine throws partway (schema failure, cancellation), no
  `ReviewOutcome` is returned, so the caller never sees the cost of the calls
  that did happen. The server stores `null` for failed and cancelled runs (see
  [`server/docs/run-lifecycle-and-cost.md`](../../server/docs/run-lifecycle-and-cost.md)).

## Adding a provider

Implement `completeStructured` in `server/src/adapters/llm/` (or here, if the
CI runner needs it too). Add tokens up across your own retries, return `null`
cost when you can't price the model, and add the provider to
`Container.buildLlm`. Tests inject a stub through `overrides.llm`, so no key or
network is needed.
