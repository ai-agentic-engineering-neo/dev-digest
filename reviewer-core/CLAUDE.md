# reviewer-core — @devdigest/reviewer-core

Pure review engine: diff → prompt → LLM → structured output → grounding gate. Uses **npm**.

## Commands
- `npm test` (vitest, stubbed LLM, no keys) · `npm run typecheck`
- `npm run build` is ONLY a typecheck — this package never emits JS.

## Map
- `src/review/run.ts` — `reviewPullRequest` entry point (single-pass / map-reduce)
- `src/prompt.ts` — `assemblePrompt`, `wrapUntrusted`, `INJECTION_GUARD`
- `src/grounding.ts` — citation gate vs the diff
- `src/llm/` — structured output (Zod → JSON Schema, parse-with-repair), OpenRouter provider
- `src/review/reduce.ts` — merge partial reviews, `scoreFromFindings`
- `src/index.ts` — public API

## Conventions (non-default)
- No I/O: no DB, filesystem, GitHub, or env reads. The only side effect is the injected `LLMProvider`.
- Callers pass RESOLVED strings (skill bodies, memory, specs), never slugs or ids.
- Optional prompt slots are omitted when empty — "no input" must produce an identical prompt.

## Gotchas
- The server consumes this package as TypeScript source via a path alias — any change to `src/index.ts`
  or exported types must also pass `pnpm typecheck` in `../server` (read `../server/CLAUDE.md` first).
- Contracts come from `../server/src/vendor/shared` (path alias), not from a local copy.
- `zod` is pinned to this package's own `node_modules` in `tsconfig.json`, so there is one Zod at type level.

## Do not touch
- `INJECTION_GUARD` / `wrapUntrusted` — never weaken them, and never replace them with keyword-scanning
  of untrusted text (a denylist only catches one phrasing or language).
- `groundFindings` — mandatory; every finding must cite a line in the diff.
- The score is always recomputed from grounded findings — never trust the model's self-reported score.

## Read when
- Changing the pipeline or the public API → read `README.md`.
- Changing how agent prompts are assembled or framed → read `../docs/agent-prompts/README.md`.
- Writing tests → read `../TESTING.md`.
- Making an architectural decision → check `docs/` first; record the decision there.
- Implementing a roadmap feature → find its spec in `specs/` (or `../specs/` if cross-module).
- Before starting work here → read `INSIGHTS.md`. When you learn something non-obvious, you MUST record it
  with the `engineering-insights` skill, and check again before finishing the task.
