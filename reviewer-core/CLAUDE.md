# reviewer-core — @devdigest/reviewer-core

Pure review logic: **diff → prompt → LLM → grounded findings**. No database,
GitHub, or filesystem — the only side effect is an LLM call through an
**injected** `LLMProvider`, which is what makes it mock-testable. Pipeline
diagram → [README.md](README.md).

Consumed by `server` via a tsconfig path alias (source, not built — `build` is
just a type-check).

## Commands

`npm test` (vitest, hermetic — stubbed `LLMProvider`, no keys/network) · `npm run typecheck`

## Map

- `prompt.ts` — `assemblePrompt` / `wrapUntrusted` (fences untrusted content + `INJECTION_GUARD`)
- `llm/` — `LLMProvider` interface + `openrouter.ts`, structured-output parsing (`structured.ts`: Zod → JSON Schema, parse-with-repair)
- `grounding.ts` — `groundFindings` / `groundingSummary`, the mandatory citation gate against the diff
- `output/` — result shaping
- `review/run.ts` — orchestrates a run (single-pass by default)
- `index.ts` — public API surface; `Review`/`Finding`/`Verdict` contracts come from `@devdigest/shared`

## References

- [docs/](docs/) — deeper notes that don't fit the README
- [specs/](specs/) — feature specs for this module
- [insights.md](insights.md) — gotchas discovered while working here; check before deep-diving. New findings get appended here by the `engineering-insights` skill

## Gotchas

- The engine accepts optional prompt slots (`skills`, `memory`, `specs`, `callers`) that later course lessons feed — the starter server passes only diff/system-prompt/repo-map, and `assemblePrompt` just omits the rest. Don't assume every slot is populated.
- A finding without a citation that exists in the diff is dropped, full stop — grounding is not optional and the score is always recomputed from survivors.
