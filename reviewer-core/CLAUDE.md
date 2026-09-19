# reviewer-core — CLAUDE.md

## Stack

Pure TypeScript, no DB/GitHub/FS. The only side effect is an LLM call through
an injected `LLMProvider`. Package manager — **npm**, not pnpm. `build` is
just a type-check, no JS is emitted. Details — [README](./README.md).

## Commands

`npm test` (vitest, hermetic units with a stub `LLMProvider`) · `npm run typecheck` (== build) · `npm ci` to install

## Map

- `src/prompt.ts` — `assemblePrompt()`, `wrapUntrusted()`, `INJECTION_GUARD`
- `src/grounding.ts` — `groundFindings()`, `groundingSummary()`
- `src/llm/openrouter.ts` — the `LLMProvider` implementation; `src/llm/structured.ts` —
  Zod → JSON Schema, parse-with-repair
- `src/review/run.ts` — orchestrates a run (single-pass by default)
- `src/index.ts` — the package's public API

## Non-default conventions

- The only consumer in the starter is `server`, which pulls in the RAW TS
  source through a tsconfig alias (`@devdigest/reviewer-core` →
  `../reviewer-core/src`), not a built package.
- The prompt accepts optional slots (`skills`, `memory`, `specs`, `callers`)
  for future course lessons — in the starter they're simply left unfilled,
  don't delete them.

## Gotchas

- Forgetting `npm ci` here → `server` crashes at startup with
  `ERR_MODULE_NOT_FOUND`; the error looks like a server issue even though the
  root cause is here.
- `INJECTION_GUARD` is deliberately NOT a keyword scan (a denylist only
  catches one phrasing) — don't "simplify" it into a regex.
- The final review score is computed deterministically from the findings that
  survived the grounding gate — the model's self-reported score is ignored.

## Do-not-touch

- The `Review`/`Finding`/`Verdict` contracts come from `@devdigest/shared` —
  change them only in sync with `server` and `client`.

## Read when

- Need the package's public API, testing strategy → read [README.md](./README.md).
- Planning a new prompt slot or pipeline change → start with [specs/](./specs/), then write code.
- Need details on how `groundFindings` works or the prompt format → [docs/](./docs/).
- Need to see how this engine gets called from server → read [../docs/architecture.md](../docs/architecture.md).
- Before changing something non-trivial — check whether we've already hit this wall → [INSIGHTS.md](./INSIGHTS.md).
