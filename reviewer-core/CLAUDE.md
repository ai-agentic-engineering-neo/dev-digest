# reviewer-core/ — @devdigest/reviewer-core

Pure review engine: diff → prompt → LLM → grounded findings. No DB, GitHub, or
filesystem access — the only side effect is an injected `LLMProvider`.
Repo-wide rules: [../CLAUDE.md](../CLAUDE.md).

## Stack

TypeScript, `zod`, `openai` SDK (used as the OpenRouter HTTP client). No
framework.

## Commands

`npm test` (vitest, hermetic — stubbed `LLMProvider`, no keys/network) ·
`npm run typecheck` (doubles as the build — this package never emits JS)

## Where things live

- `src/prompt.ts` — `assemblePrompt()` / `wrapUntrusted()` + `INJECTION_GUARD`
- `src/grounding.ts` — `groundFindings()`, the mandatory citation gate
- `src/llm/` — provider client + structured-output parsing (Zod → JSON Schema)
- `src/review/run.ts` — single-pass orchestration; `reduce.ts` — map-reduce path

## Non-default conventions

- **Never** add DB/GitHub/FS calls here. The server is this package's only
  consumer precisely because it's side-effect-free and mock-testable; an I/O
  call here breaks that contract for every future consumer (e.g. the L06 CI
  runner).
- A finding without a real diff-line citation is dropped by `groundFindings` —
  the score is recomputed from survivors, never trusted from the model's
  self-report.
- Consumed as TypeScript **source** via a tsconfig path alias by the server —
  don't assume a `dist/` build exists or is used.

## Session protocol

- Before work: skim [INSIGHTS.md](INSIGHTS.md); name the top relevant points.
- After a non-trivial task: run the `engineering-insights` skill.

## Docs map

- [README.md](README.md) — pipeline diagram, public API
- [INSIGHTS.md](INSIGHTS.md) — dev log: decisions/gotchas found while working here
