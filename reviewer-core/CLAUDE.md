# `@devdigest/reviewer-core` — the pure review engine

## Before answering

**Read the matching document before you touch code.**

| If the task touches… | Read first |
|---|---|
| prompt assembly, the grounding gate, or scoring | `README.md` — pipeline diagram |
| adding or filling a prompt slot (`skills` `memory` `specs` `callers`) | `specs/` for the lesson, then `src/prompt.ts` |
| what this package exposes | `src/index.ts` — the public API is that file and nothing else |
| how the server consumes the engine | `../server/README.md` |
| any test | `../TESTING.md` |
| a failure that smells familiar | `INSIGHTS.md` — and **append** to it when you hit a new one |

If nothing matches, proceed.

## Commands

`npm test` (vitest, hermetic, stubbed `LLMProvider`) · `npm run typecheck`
`npm run build` is the same type-check — **this package never emits JS.**

Note: npm, not pnpm. The lockfile here is `package-lock.json`.

## Where things live

| | |
|---|---|
| `src/prompt.ts` | `assemblePrompt()`, `wrapUntrusted()`, `INJECTION_GUARD` |
| `src/grounding.ts` | `groundFindings()`, `groundingSummary()` — the citation gate |
| `src/llm/` | `openrouter.ts` (provider), `structured.ts` (Zod → JSON Schema, parse-with-repair) |
| `src/review/` | `run.ts` (orchestration, single-pass), `reduce.ts` (map-reduce path) |
| `src/output/to-review.ts` | the CI payload helper used from L06 |
| `src/index.ts` | the export surface |

## Conventions

- **Pure.** No database, no GitHub, no filesystem, no `process.env`. The only side effect
  is a call through the **injected** `LLMProvider` — that injection is what makes the
  package testable, so never import a concrete client into the pipeline.
- **The grounding gate is mandatory, not an option.** A finding that does not cite a real
  line in the diff is dropped, and the score is recomputed deterministically from the
  surviving findings — never trusted from the model.
- Untrusted content (diffs, repo text) is fenced with `wrapUntrusted()` + `INJECTION_GUARD`
  before it reaches the prompt.
- Optional prompt slots are lesson-fed. An omitted slot must simply drop out of the
  assembled prompt, leaving no empty heading behind.
- Contracts (`Review`, `Finding`, `Verdict`, …) come from `@devdigest/shared`.

## Gotchas

- The server consumes the **TypeScript source** through a tsconfig path alias
  (`@devdigest/reviewer-core` → `../reviewer-core/src`), under tsx in dev and vitest in
  tests. There is no build artefact to refresh — but a type error here breaks the server.
- Every new behaviour needs a test with a stubbed provider. No keys, no network, ever.
