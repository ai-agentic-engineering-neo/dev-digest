# reviewer-core — @devdigest/reviewer-core (pure review engine)

diff + agent inputs + injected LLM → grounded `Review`. Consumed by the server as TypeScript source via path alias.

## Commands
`npm test` (vitest, stubbed LLM, no keys) · `npm run typecheck` (= `build`; the package never emits JS)

## Map
- `src/review/run.ts` — entry point `reviewPullRequest` (single-pass / map-reduce)
- `src/prompt.ts` — `assemblePrompt`, `wrapUntrusted`, `INJECTION_GUARD`
- `src/grounding.ts` — mandatory citation gate against the diff
- `src/llm/` — structured output (Zod → JSON Schema, repair) + `OpenRouterProvider`
- `src/output/to-review.ts` — GitHub review payload, `countBlockers`
- `src/index.ts` — public API; anything consumers use must be exported here

## Conventions
- NO I/O: no DB, fs, `process.env`. Network only inside `LLMProvider` implementations (`llm/openrouter.ts`); engine code (`prompt`, `grounding`, `review/*`) uses the injected provider only.
- Untrusted input (diff, PR body, repo map, callers, specs) always goes through `wrapUntrusted`.
- Never trust model-reported score/locations: findings must survive `groundFindings`, score is recomputed.
- Prompt-injection defense = the shared `INJECTION_GUARD` rule, NOT keyword scanning of untrusted text.

## Gotchas
- Contracts come from `../server/src/vendor/shared` (alias `@devdigest/shared`); `zod` is aliased to this package's `node_modules` to avoid two Zod instances.
- Optional prompt slots (`skills`, `memory`, `specs`) are for later milestones; the starter server doesn't pass them.

## Deeper
[README.md](README.md) (pipeline diagram, public API) · [INSIGHTS.md](INSIGHTS.md) · [docs/](docs/) · [specs/](specs/)
