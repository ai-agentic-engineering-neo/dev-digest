# reviewer-core/ — `@devdigest/reviewer-core` (pure review engine)

## Before answering

Search `reviewer-core/docs/`, `reviewer-core/specs/`, `reviewer-core/INSIGHTS.md` first.

## Commands (npm, NOT pnpm — run in `reviewer-core/`)

- `npm ci` · `npm test` (vitest, stubbed LLM) · `npm run typecheck` (also the "build"; no JS is emitted)
- After changes, also run server unit tests: `cd ../server && pnpm exec vitest run --exclude '**/*.it.test.ts'`.

## Layout

- `src/index.ts` — the public API; anything the server uses must be exported here.
- `src/review/run.ts` — `reviewPullRequest`: assemble → single-pass | map-reduce → reduce → grounding.
- `src/prompt.ts` — `assemblePrompt`, `wrapUntrusted`, `INJECTION_GUARD`.
- `src/grounding.ts` — citation gate vs the diff. `src/llm/` — structured output + OpenRouter provider.
- `src/output/to-review.ts` — Review → GitHub review payload (CI path, L06).

## Hard rules (the engine's contract)

- NO I/O: no DB, filesystem, GitHub, env reads. The only side effect is the injected `LLMProvider`.
- Untrusted content (diff, PR body, repo map, callers, specs) MUST go through `wrapUntrusted`.
  Never weaken `INJECTION_GUARD` or add keyword-based "ignore this" filtering.
- Grounding is mandatory: findings not citing a real diff line are dropped; score is recomputed from
  surviving findings — never trust the model's self-reported score.
- skills/memory/specs arrive as RESOLVED strings (slug → body is the caller's job, never the engine's).
- New prompt slot = optional input; empty/undefined ⇒ section omitted (prompt byte-identical to before).
- Cancellation via `checkCancelled()` callback before each LLM call; the engine never defines error types for it.

## Gotchas

- Imports `@devdigest/shared` from `../server/src/vendor/shared` (tsconfig alias), and pins `zod` to its own
  `node_modules` — keep `zod` versions aligned with server, or ZodError `instanceof` checks break.
- Missing `node_modules` here crashes the API at boot (`ERR_MODULE_NOT_FOUND`).

## Read when

- Changing the pipeline/public API → read `README.md` (Pipeline, Public API).
- Changing prompt wording or agent prompts → read `../docs/agent-prompts/README.md`.
- Deep-dives → read `docs/` · specs → read `specs/` · findings → read `INSIGHTS.md`.
