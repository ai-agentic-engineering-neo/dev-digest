# reviewer-core — pure review engine: diff + context → prompt → LLM → findings → grounding. Has NO DB, FS or network (apart from the injected LLM).

## Stack
TypeScript 5.7 · Zod 3.24 · openai SDK 4 (for OpenRouter) · vitest 2 · **npm** (package-lock.json, not pnpm)

## Commands
- `npm run typecheck` · `npm test` · single test: `npx vitest run <path>`
- `npm run build` = typecheck only: server imports the sources directly (../reviewer-core/src)

## Map
- src/review/run.ts — review orchestration (`reviewPullRequest`); reduce.ts — map-reduce over files
- src/prompt.ts — prompt assembly + INJECTION_GUARD
- src/llm/structured.ts — structured output: Zod → JSON Schema, repair; openrouter.ts — the provider
- src/output/to-review.ts — selection/normalization of findings into a Review
- src/grounding.ts — grounding gate
- src/index.ts — public API; the LLMProvider interface is in ../server/src/vendor/shared/adapters.ts

## Conventions
- All documentation is written in English (CLAUDE.md, README, specs, INSIGHTS, code comments)
- No imports of the DB, fs or Fastify — pure logic only; the LLM comes in as a parameter
- Tests use a model stub, no keys or network

## Gotchas
- Contracts come from ../server/src/vendor/shared — the package physically depends on the server/ tree
- A change here breaks the server typecheck and triggers CI server-unit — check both
- README lags behind: the executor also passes the callers digest and a rank note ("high blast-radius")
- The OpenAI/Anthropic providers live in server/src/adapters; OpenRouter lives here

## Do not touch
- INJECTION_GUARD — the only trusted rule; we don't add keyword filters (a deliberate decision)
- Grounding gate and score recalculation: a finding without a real line in the diff is dropped, and the model's score is ignored

## Read when
- Before changing the pipeline → read README.md ("Pipeline")
- Before changing exports → read README.md ("Public API")
- Before changing feature behavior → read specs/<feature>.md if it exists
- Before a design-level change → read docs/
- Before adding a dependency or a new port → skill `onion-architecture` (this package is the pure core)
- Before editing anything here → read INSIGHTS.md

## Insights
This package's lessons live in INSIGHTS.md (append-only, 7 sections). Hooks handle reading at the start and the wrap-up at the end; selection rules, format and writing — skill `engineering-insights` (`/engineering-insights`, `/engineering-insights review`).
An entry that fired twice → move it to Gotchas and mark it in INSIGHTS with a new entry `(→ CLAUDE.md)`.
