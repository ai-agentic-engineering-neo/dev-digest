# `@devdigest/reviewer-core` — the review engine

Pure logic: diff → prompt → LLM → grounded findings. No DB/GitHub/filesystem;
the only side effect is an injected `LLMProvider`. Consumed by `server/` via a
tsconfig path alias to TypeScript source (no publish step).

## Stack

TypeScript only — minimal runtime deps: `openai` (LLM client interface) and
`zod` (contracts, re-exported from `@devdigest/shared`). No JS emit; `build`
is a type-check. Test: vitest.

## Commands

`npm test` (vitest) · `npm run typecheck` (doubles as the build — package never emits JS).

## Read when

- `README.md` — pipeline diagram, public API.
- `../TESTING.md` — this module's suite (`reviewer-core.yml`).
- `docs/` — design notes/ADRs for this module.
- `specs/` — feature/behavior specs for this module.
- `INSIGHTS.md` — accumulated gotchas/decisions for this module.

## Naming conventions

- One file per pipeline stage, named after the stage (not the ticket/feature) and matching the README's pipeline diagram: `prompt.ts`, `grounding.ts`, `llm/structured.ts`, `review/run.ts`.
- Tests are colocated `*.test.ts` next to the file under test.

## Gotchas

- Pure engine — never add DB, GitHub, or filesystem access here; the LLM call is the only side effect, and it must go through the injected `LLMProvider` so tests can stub it.
- The grounding gate (`groundFindings()`) is mandatory — never bypass or weaken it to "recover" a missing finding; a finding that doesn't cite a real diff line must be dropped.
- Optional prompt slots (`skills`, `memory`, `specs`, `callers`) exist for later lessons — the starter server only feeds diff/system-prompt/repo-map; missing slots are expected, not a bug.

## Do not touch

- `package-lock.json` — regenerate via `npm install`, never hand-edit.
