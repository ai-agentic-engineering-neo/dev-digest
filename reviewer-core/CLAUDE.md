# reviewer-core — @devdigest/reviewer-core

Pure review engine: diff → prompt → LLM → grounded findings. TypeScript 5.7 · Zod 3 · Vitest 2 · npm · ESM
Pipeline diagram and public API: [README.md](README.md) · root rules: [../CLAUDE.md](../CLAUDE.md)

## Commands
- `npm test` (hermetic, stubbed LLM, no keys) · `npm run typecheck`
- `build` is only a type-check: the package never emits JS. Server consumes `src/` directly.

## Map
- `src/prompt.ts` assemble prompt · `src/grounding.ts` citation gate · `src/llm/` provider + structured output
- `src/review/run.ts` orchestration · `src/index.ts` public exports

## Conventions
- Stay pure: no DB, GitHub, filesystem. The only side effect is the injected `LLMProvider`.
- Untrusted content (diff, PR text) must go through `wrapUntrusted()`.
- Tests use a stubbed `LLMProvider`; never call a real model.

## Do not touch
- The grounding gate (`groundFindings`) is mandatory: findings that don't cite a real diff line must be dropped.
- Score is recomputed from surviving findings; never trust the model's score.

## Gotchas
- `@devdigest/shared` resolves to `../server/src/vendor/shared`, and `zod` is pinned to this package's own
  `node_modules` in tsconfig paths. Don't remove those aliases.
- Optional prompt slots (skills, memory, specs, callers) are unused in the starter; leave them omitted, not stubbed.

## Docs (linked, open when relevant)
[docs/](docs/) · [specs/](specs/) · [INSIGHTS.md](INSIGHTS.md)
