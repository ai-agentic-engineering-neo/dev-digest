# reviewer-core — @devdigest/reviewer-core

Pure review engine: diff → prompt → LLM → grounded findings. TypeScript 5 · Zod 3 · vitest 2. Package manager: npm.

## Where things are
- `src/prompt.ts` — `assemblePrompt`, `wrapUntrusted`, `INJECTION_GUARD`
- `src/grounding.ts` — the citation gate (findings must hit real diff lines)
- `src/llm/` — `structured.ts` (Zod → JSON Schema, parse-with-repair) · `openrouter.ts` (provider)
- `src/review/` — `run.ts` (orchestration) · `reduce.ts` (map-reduce merge)
- `src/output/to-review.ts` — CI payload helper (used from M6)
- `src/index.ts` — public API; contracts come from `@devdigest/shared` (= `server/src/vendor/shared`)

## Commands
`npm test` · `npm run typecheck` (this IS the build — the package never emits JS)

## Hard rules
- No DB, GitHub, filesystem or network access. The only side effect is an LLM call through the injected `LLMProvider`.
- Never bypass or weaken grounding; the score is recomputed from surviving findings, never trusted from the model.
- Every untrusted block in the prompt goes through `wrapUntrusted()`.

## Gotchas
- Consumed as raw TS source by the server (tsconfig alias) — a type error here breaks the server too.
- Optional prompt slots (`skills`, `memory`, `specs`, `callers`) are empty in the starter; milestones start filling them.

## Read when relevant
- `README.md` — pipeline diagram and public API
- `../docs/agent-prompts/README.md` — how an agent prompt becomes model messages
- `../.claude/skills/onion-architecture/SKILL.md` — this package is the pure core; before adding any I/O or new export
- `docs/` · `specs/` (before a milestone feature) · `INSIGHTS.md` (before non-trivial changes)
