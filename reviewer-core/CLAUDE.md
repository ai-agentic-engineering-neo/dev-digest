# reviewer-core — CLAUDE.md

`@devdigest/reviewer-core`: pure review engine (diff + agent config + repo context → prompt → LLM → grounded findings), npm. No DB, GitHub, filesystem or env access; the only side effect is an injected `LLMProvider`.

## Commands (`cd reviewer-core`)
`npm ci` · `npm test` · `npm run typecheck` (`build` is also just a typecheck; this package never emits JS)

## Map
`src/index.ts` (public API) · `src/review/run.ts` (`reviewPullRequest`) · `src/prompt.ts` (`assemblePrompt`, `INJECTION_GUARD`) · `src/grounding.ts` · `src/llm/` · `src/output/to-review.ts` · `src/review/reduce.ts` (map-reduce)

## Conventions
- Stay pure: no `node:fs`, `process.env`, DB or network clients; take dependencies as parameters.
- Everything consumers use is exported from `src/index.ts`.
- Tests stub the model; no keys.

## Do not touch
- `@devdigest/shared` here resolves to `../server/src/vendor/shared`; edit contracts there.
- `tsconfig.json` pins `zod` to `./node_modules/zod`; don't remove it (shared contracts must resolve zod from here).

## Gotchas
- The server runs this package's raw source → every change here is a server change too: run server typecheck + unit tests.
- Grounding is mandatory: findings citing lines outside the diff are dropped and the score is recomputed. Don't bypass `groundFindings`.
- Prompt-injection defense is the single `INJECTION_GUARD` rule, by design; don't add keyword denylists.

## Read when
- Read `README.md` before changing the pipeline or the public API.
- Read `../docs/agent-prompts/README.md` before changing how prompts are assembled or what output the engine expects.
- Read `../server/README.md` (Review context) to see which inputs the server passes in.
- Read `docs/` for engine reference that doesn't fit the README.
- Read `specs/` before implementing an engine feature; write the spec first if missing.
- Read `INSIGHTS.md` before any work in this package (root Insights protocol); add entries only via the `engineering-insights` skill.
