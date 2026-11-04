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

## Naming conventions

- One concern per lowercase/kebab file, grouped by pipeline stage: `review/run.ts`, `review/reduce.ts`, `llm/structured.ts`,
  `output/to-review.ts`; top-level `prompt.ts`, `grounding.ts`. Relative imports end in `.js`.
- Public functions verb-first camelCase: `assemblePrompt`, `groundFindings`, `reviewPullRequest`, `toReviewPayload`.
- Entry-point types `<Thing>Input` / `<Thing>Outcome` (`ReviewInput`, `ReviewOutcome`); provider options `<Class>Options`.
- Tunable defaults exported as `DEFAULT_<WHAT>` (`DEFAULT_MAP_THRESHOLD_LINES`); private constants SCREAMING_SNAKE
  (`INJECTION_GUARD`, `MAX_PR_DESCRIPTION_CHARS`, `FULL_FILE_KINDS`, `SEVERITY_PENALTY`).
- Callbacks on inputs: sinks `on<Event>` (`onEvent`, `onUsage`), guards `check<Condition>` (`checkCancelled`).
- Prompt slots: input field camelCase (`repoMap`, `prDescription`) ↔ `PromptAssembly` key snake_case (`repo_map`,
  `pr_description`) ↔ `wrapUntrusted` label kebab (`'repo-map'`, `'pr-description'`, `` `spec-${i}` ``) ↔ heading `## Repo skeleton`.
- Tests: `test/<src-file-name>.test.ts` mirroring the source file (`prompt.test.ts`, `run.test.ts`, `to-review.test.ts`).

## Gotchas

- Imports `@devdigest/shared` from `../server/src/vendor/shared` (tsconfig alias), and pins `zod` to its own
  `node_modules` — keep `zod` versions aligned with server, or ZodError `instanceof` checks break.
- Missing `node_modules` here crashes the API at boot (`ERR_MODULE_NOT_FOUND`).

## Read when

- Changing the pipeline/public API → read `README.md` (Pipeline, Public API).
- Changing prompt wording or agent prompts → read `../docs/agent-prompts/README.md`.
- Deep-dives → read `docs/` · specs → read `specs/` · findings → read `INSIGHTS.md`.
