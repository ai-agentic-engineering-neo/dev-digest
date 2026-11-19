# reviewer-core — @devdigest/reviewer-core

Pure engine: diff → prompt → LLM → grounded findings. TS 5.7 · Zod 3 · openai SDK · Vitest 2.
Package manager: **npm** (package-lock.json) — not pnpm.

## Commands
- `npm test` · `npm run typecheck` (build == typecheck; never emits JS)

## Map
- `src/index.ts` — public API (consumers import only from here)
- `src/review/run.ts` — reviewPullRequest (single-pass / map-reduce)
- `src/prompt.ts` — assemblePrompt + wrapUntrusted
- `src/grounding.ts` — citation gate · `src/llm/` — structured output, OpenRouter

## Hard rules
- NO DB, GitHub, fs or network — only the injected LLMProvider.
- All untrusted input (diff, PR body, repo map) goes through wrapUntrusted.
- Grounding gate runs once, after reduce; score derived from kept findings.
- Types come from `@devdigest/shared` (aliased to ../server/src/vendor/shared).

## Read when…
- Changing pipeline or prompt → README.md
- Feature work → specs/ · Deep dives → docs/
- Before any change → INSIGHTS.md

## Gotchas
- Consumed as TS source by server via tsconfig alias — also run server typecheck after API changes.
