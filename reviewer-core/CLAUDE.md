# reviewer-core (@devdigest/reviewer-core)

Pure review engine: diff to prompt to injected LLM to grounded findings. Stack: TypeScript ESM (`"type": "module"`), Node >= 22, no framework; Zod, openai SDK, Vitest.

## Commands
- `npm install` (CI-style: `npm ci`, as `scripts/dev.sh` does)
- `npm run build` is only a type-check (`tsc --noEmit`); nothing is emitted

## Verify
- `npm run typecheck`
- `npm test` (`vitest run --passWithNoTests`)
- No linter or formatter is configured; do not add a lint command.

## Naming conventions
- Sources are kebab-case files under `src/<area>/` (`review`, `llm`, `output`); tests are `*.test.ts` in `test/`.

## Hard rules and gotchas
- No database, GitHub or filesystem access; the only side effect is an LLM call through an injected `LLMProvider`.
- Consumed by the server as TypeScript source via the `@devdigest/reviewer-core` path alias (`../reviewer-core/src`); there is no build step.
- Findings must cite a line that exists in the diff or they are dropped (`groundFindings`); the score is recomputed from surviving findings.
- Tests are hermetic: stubbed `LLMProvider`, no keys, no network.

## Read when
- Read [README](README.md) when changing the engine flow; its [pipeline section](README.md#pipeline) has the stages.
- Read [docs](docs/README.md) when you need how-it-works detail.
- Read [specs](specs/README.md) when starting a lesson or feature.
- Read [INSIGHTS](INSIGHTS.md) at the start of any task in this module.
- Read [TESTING](../TESTING.md) when adding tests.
- Read the [root README](../README.md) when setting up the whole project.

## Folder map
- `src/review/`: engine entry point and map-reduce helpers
- `src/llm/`: structured-output LLM provider
- `src/output/`: grounded Review to GitHub review payload
- `test/`: Vitest tests (reuse the server's mocks)
