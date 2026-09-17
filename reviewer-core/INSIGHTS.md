# reviewer-core — insights

Durable findings recorded by the `engineering-insights` skill: things that are
true about this code but not visible in it. Append-only — correct a stale entry
with a dated note beneath it rather than editing it away.

Sections are fixed. Add to the one that fits; never invent a new heading.

## What Works

- **2026-09-16** — `parseWithRepair` parses the raw response directly before falling back to `extractJson`, because fence/brace extraction is fooled by ``` or `{` appearing *inside* JSON string values (markdown in a finding body) — the fallback must stay the second attempt, never the first. Evidence: `reviewer-core/src/llm/structured.ts:57-60`.

- **2026-09-16** — Keeping the engine free of I/O is what lets the studio and the CI runner share one review path, so prompt hardening and the grounding gate cannot be bypassed by adding a second caller. Evidence: `reviewer-core/src/index.ts:1-13`.

## What Doesn't Work

- **2026-09-16** — Requesting the `map-reduce` strategy on a single-file diff still runs one pass, so strategy alone never guarantees per-file calls — assert on `ReviewOutcome.mode`, not on the requested strategy. Evidence: `reviewer-core/src/review/run.ts:117`.

## Codebase Patterns

- **2026-09-16** — Cost attribution is injected into `OpenRouterProvider` rather than tabled in the engine: the server passes its live PriceBook, the CI runner passes nothing and gets `null`, so a null cost means "no estimator supplied or model unknown", not "free". Evidence: `reviewer-core/src/llm/openrouter.ts:36`.

- **2026-09-16** — Cancellation is caller-owned: the engine only calls an injected `checkCancelled()` that is expected to throw, so it defines no cancellation error type and does no cleanup — a caller that returns instead of throwing will not stop the run. Evidence: `reviewer-core/src/review/run.ts:88-92`.

## Tool & Library Notes

- **2026-09-16** — The OpenAI SDK's `models.list` strips OpenRouter's `pricing` field, so model pricing has to be fetched with a raw `fetch` against `/models` rather than through the SDK. Evidence: `reviewer-core/src/llm/openrouter.ts:119-121`.

## Recurring Errors & Fixes

## Session Notes

## Open Questions
