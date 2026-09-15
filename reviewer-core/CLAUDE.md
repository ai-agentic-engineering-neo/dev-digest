# reviewer-core (@devdigest/reviewer-core)

## Before answering

Search `reviewer-core/docs/`, `reviewer-core/specs/`,
`reviewer-core/INSIGHTS.md` first.

## Conventions (not obvious from code)

- Pure library — no DB/GitHub/filesystem access; its only side effect is one
  call through an injected `LLMProvider`, which is what makes it
  mock-testable.
- Ships no compiled JS — `build` is a type-check; the server imports the
  TypeScript source directly via a tsconfig path alias.
- `skills` / `memory` / `specs` / `callers` prompt slots exist in the API for
  later course lessons and are simply omitted by the starter, not stubbed.

## Do-not-touch

- `INJECTION_GUARD` in `prompt.ts` — deliberate trust-boundary design
  (untrusted content is data, never instructions); don't replace with
  keyword/denylist scanning.
- `groundFindings()` must stay the single source of truth for the score —
  never trust the model's self-reported score.

## Use when

- Pipeline, public API → read `README.md`
- Deep-dives / specs / running notes → `docs/` · `specs/` · `INSIGHTS.md`
- How the server actually calls in → `../server/src/modules/reviews/run-executor.ts`
- Cross-package rules → `../CLAUDE.md`
