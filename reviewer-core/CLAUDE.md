# reviewer-core/CLAUDE.md

Map for `@devdigest/reviewer-core`. Root map: [../CLAUDE.md](../CLAUDE.md). Deep dive: [README.md](README.md).

## Role

Pure review engine: **diff → prompt → LLM → grounded findings**. No DB, no
GitHub, no filesystem — the only side effect is one LLM call through an
**injected** `LLMProvider`, which is what makes it mock-testable. `server` is
its only consumer today (local reviews); a CI runner reuses it later in the
course.

## Run / test

```sh
npm test         # vitest, no Docker, no network
npm run typecheck
```

## Non-default conventions

- This package is consumed as **TypeScript source** via a tsconfig path alias
  (`@devdigest/reviewer-core` → `../reviewer-core/src`), from both `server`
  (tsx in dev) and tests (vitest) — it does not publish or import compiled JS.
- `build` is a type-check only (`tsc --noEmit`); there is no `dist/` output.
- Never add a DB, HTTP, or filesystem import here — that's what keeps it
  mock-testable and shareable with the (future) CI runner. New I/O belongs in
  the caller (`server`), passed in as data or an injected provider.

## Learnings

Read [`INSIGHTS.md`](INSIGHTS.md) before starting work here — if it has
entries, note the ones relevant to this task before proceeding.

## Gotchas

- The output JSON shape is enforced by the Zod `Review` schema
  (`@devdigest/shared`) passed to the LLM as `response_format`, not by prompt
  text — don't describe the JSON shape in a system prompt, it's redundant/
  conflicting. See [`../docs/agent-prompts/README.md`](../docs/agent-prompts/README.md).
- `score` and citation-grounded findings are **recomputed** here, never trusted
  from the model's raw output (`grounding.ts`, `review/reduce.ts`).

## Do not touch

- `package-lock.json`.
