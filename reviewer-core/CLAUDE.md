# reviewer-core — review engine

Before changing this package read `docs/README.md`.
Feature contracts: `specs/` (one file per feature).

TypeScript 5.7 · Zod 3 · openai 4 (OpenRouter client) · vitest 2 · package manager: npm

## Commands
- `npm test` · `npm run lint` (ESLint 9 flat) · `npm run typecheck` (= build; the package never emits JS — server consumes the source)

## Map
- `src/prompt.ts` assemblePrompt, wrapUntrusted, INJECTION_GUARD
- `src/grounding.ts` citation gate against the diff
- `src/llm/` OpenRouter provider + structured output (Zod → JSON Schema, parse-with-repair)
- `src/review/run.ts` orchestration · `src/review/reduce.ts` map-reduce · `src/output/to-review.ts`
- Public API = `src/index.ts` only

## Hard rules
- PURE: no DB, GitHub, filesystem, or env access. Only side effect = the injected `LLMProvider`.
- Grounding is mandatory; score is recomputed from surviving findings — never trust the model's score.
- Prompt-injection defense = the single INJECTION_GUARD rule. Do NOT add keyword/denylist scanning.
- Untrusted content (diff, PR body, repo files) always goes through `wrapUntrusted`.

## Gotchas
- Optional prompt slots (skills, memory, specs, callers) must be omitted when empty — the prompt must
  stay identical to the baseline.
- Server imports this package via a tsconfig path alias: after changing exports, run server typecheck too.

## Read when
- Changing pipeline stages or the public API → `README.md`
- Adding a prompt slot for a lesson → `specs/`, then `docs/`
- Before touching grounding or prompt assembly → `INSIGHTS.md`
