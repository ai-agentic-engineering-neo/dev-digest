# reviewer-core — @devdigest/reviewer-core

## Stack
TypeScript 5.7 · Zod 3.24 · openai SDK 4 (OpenRouter) · Vitest 2 · npm

## Commands
`npm test` · `npm run typecheck` (= build; the package never emits JS)

## Map
- `src/review/run.ts` — `reviewPullRequest()` entry (single-pass / map-reduce)
- `src/review/reduce.ts` — merge partial reviews, `scoreFromFindings`
- `src/prompt.ts` — `assemblePrompt`, `wrapUntrusted`, `INJECTION_GUARD`
- `src/grounding.ts` — mandatory citation gate against the diff
- `src/llm/` — provider + structured output (Zod → JSON Schema, parse-with-repair)
- `src/index.ts` — public API (anything not exported here is internal)

## Rules (non-negotiable)
- PURE: no DB, fs, GitHub or env access. The only side effect is the injected `LLMProvider`.
- Untrusted content (diff, PR body, repo map, specs) always goes through `wrapUntrusted`.
- Never trust the model's score: it is recomputed from findings that survived grounding.
- The grounding gate runs on every path; don't bypass or duplicate it per strategy.
- New context = optional prompt slot; empty/undefined → the section is omitted.
- No keyword denylists against prompt injection — the defense is `INJECTION_GUARD`.

## Gotchas
- `@devdigest/shared` resolves to `../server/src/vendor/shared` (tsconfig alias).
- Tests use a stubbed `LLMProvider` — no keys, no network.

## Read when
| When | Read |
|---|---|
| Pipeline overview, public API | `README.md` |
| Changing prompt wording/structure | `../docs/agent-prompts/README.md` |
| Deep reference | `docs/` |
| Implementing a milestone | `specs/` |
| Before non-trivial changes | `INSIGHTS.md` |
