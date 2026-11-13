# reviewer-core/ — @devdigest/reviewer-core

Pure review engine: diff → prompt → LLM → grounded findings. Full picture:
[README.md](./README.md).

## Stack
TypeScript, vitest. No database, GitHub, or filesystem access — the only side
effect is an LLM call through an injected `LLMProvider`. Standalone package —
consumed by `server/` via a tsconfig path alias, never published or built to JS.

## Commands
- `npm test` — vitest, hermetic units with a stubbed `LLMProvider`
- `npm run typecheck` — **doubles as the build**; the package never emits JS

## What lives where
- `src/prompt.ts` — `assemblePrompt()`, `wrapUntrusted()` + `INJECTION_GUARD`.
- `src/grounding.ts` — `groundFindings()`, the mandatory citation gate.
- `src/llm/` — provider interface + `openrouter.ts`, structured-output parsing.
- `src/review/run.ts` — orchestrates a single-pass review run; `reduce.ts` scores it.
- `docs/` — engine design notes. `specs/` — feature specs.

## Non-default conventions
- **Score is always recomputed from grounded findings**, never trusted from the
  model (`scoreFromFindings` in `reduce.ts`).
- **A finding that doesn't cite a real diff line is dropped** — grounding is
  mandatory, not optional.
- **`build` is a type-check only** — this package intentionally never emits JS;
  `server/` consumes its TypeScript source directly via a path alias.

## Gotchas
Running log of non-obvious decisions and hard-won lessons: [INSIGHTS.md](./INSIGHTS.md).
The `engineering-insights` skill keeps this updated proactively — Claude appends
entries as issues are found and during end-of-session wrap-ups, so treat it as
current guidance, not a write-only log.

## Links
[README](./README.md) · [docs/](./docs/) · [specs/](./specs/) · [INSIGHTS.md](./INSIGHTS.md) ·
[Testing strategy](../TESTING.md) · [Root CLAUDE.md](../CLAUDE.md)
