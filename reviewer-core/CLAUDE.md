# reviewer-core — @devdigest/reviewer-core

Pure review engine: diff → prompt → LLM → grounded findings. TypeScript 5.7 + Zod 3.24 + openai SDK 4. Package manager: **npm**.

## Docs — read when relevant
- [README.md](README.md) — pipeline diagram and public API.
- [docs/](docs/) — deeper engine notes.
- [specs/](specs/) — feature specs. **Find the spec before implementing a feature.**
- Server-side caller: `../server/src/modules/reviews/run-executor.ts`.

## Commands
- `npm test` · `npm run typecheck` (`build` is also only a type-check — the package never emits JS)

## Where things live
- `src/prompt.ts` — `assemblePrompt`, `wrapUntrusted`, `INJECTION_GUARD`
- `src/grounding.ts` — citation gate vs the diff
- `src/llm/` — provider + structured output · `src/review/run.ts` — orchestration
- `src/index.ts` — public API; anything not exported here is internal

## Conventions
- **No side effects** except the call through the injected `LLMProvider`: no DB, GitHub, FS, env reads.
- Contracts come from `@devdigest/shared` (path alias → `../server/src/vendor/shared`); don't define them here.
- Tests use a stubbed `LLMProvider` — no keys, no network.

## Gotchas
- Server consumes this package's **source** via tsconfig alias — a breaking export change breaks server typecheck.
- Optional prompt slots (`skills`, `memory`, `specs`, `callers`) are empty in the starter; lessons fill them.

## Do not touch
- Grounding must stay mandatory and the score recomputed from surviving findings.
- Injection defense stays a trusted rule (`INJECTION_GUARD`), not keyword filtering.

## Insights
@INSIGHTS.md
