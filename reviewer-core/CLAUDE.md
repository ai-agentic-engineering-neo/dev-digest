# reviewer-core — `@devdigest/reviewer-core` (pure review engine)

## Commands (run in `reviewer-core/`, npm not pnpm)
- `npm test` · `npm run typecheck` (also the build — the package never emits JS)

## Layout
- `src/prompt.ts` — `assemblePrompt`, `wrapUntrusted`, `INJECTION_GUARD`
- `src/llm/` — `openrouter.ts` (provider), `structured.ts` (Zod → JSON Schema, parse-with-repair)
- `src/grounding.ts` — citation gate vs the diff
- `src/review/` — `run.ts` (orchestration), `reduce.ts` (score + map-reduce merge)
- `src/output/to-review.ts` — CI review payload (used from M6)

## Conventions
- Pure: no DB, GitHub, filesystem, or env. The only side effect is the injected `LLMProvider`.
- Consumed as TypeScript source by the server via tsconfig alias — no build artifacts.
- Contracts come from `../server/src/vendor/shared` (`@devdigest/shared`).
- Everything repo- or author-derived goes into the prompt via `wrapUntrusted`.

## Gotchas
- Output shape is enforced by the provider (`json_schema`, strict) — never describe JSON in prompts.
- `score` is recomputed in `reduce.ts` (CRITICAL −35, WARNING −12, SUGGESTION −3);
  the model's score is ignored. `verdict` is still passed through from the model.
- A finding whose line range misses every diff hunk is dropped by grounding.
- Optional prompt slots (skills, memory, specs, callers) exist for later milestones;
  empty slots are omitted from the prompt.

## Do not touch without asking
`INJECTION_GUARD` and the untrusted-wrapping — they are the prompt-injection defense.

## Read when relevant
README.md (pipeline, public API) · ../docs/agent-prompts/README.md · docs/ · INSIGHTS.md
