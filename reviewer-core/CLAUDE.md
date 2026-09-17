# `reviewer-core/` — @devdigest/reviewer-core

Pure review engine: diff → prompt → LLM → grounded findings. No DB, GitHub, or
FS. Full docs: [`README.md`](README.md). Deeper notes: [`docs/`](docs/) ·
[`specs/`](specs/) · [`INSIGHTS.md`](INSIGHTS.md).

## Stack

TypeScript 5.7 · `zod` 3.24 · `openai` 4.77 (types only — no live calls made
from here) · `vitest` 2.1 · `tsx`.

## Commands

```
npm run typecheck   # doubles as `build` — package never emits JS
npm test            # vitest, hermetic, stubbed LLMProvider — no keys/network
```

## Map

- `src/prompt.ts` — `assemblePrompt`, `wrapUntrusted`, `INJECTION_GUARD`
- `src/grounding.ts` — `groundFindings`, `groundingSummary`
- `src/llm/` — `openrouter.ts` (the injected `LLMProvider`), `structured.ts`
  (Zod → JSON Schema, parse-with-repair)
- `src/review/run.ts` — orchestrates a single-pass run
- `src/index.ts` — public exports

## Conventions & gotchas (non-default, not guessable from the code)

- Pure logic only — the **only** side effect is an injected `LLMProvider`,
  which is what makes this mock-testable. Don't add DB/GitHub/FS calls here.
- Consumed by `server` as TypeScript **source** via a tsconfig path alias
  (`@devdigest/reviewer-core` → `../reviewer-core/src`), not a built
  artifact — `build` is a type-check only.
- Grounding is mandatory and non-negotiable: never let a finding through
  without a citation that exists in the actual diff.
- `INJECTION_GUARD` is one shared rule appended to every agent's system
  prompt. Never replace it with a keyword denylist — a denylist only ever
  catches one phrasing.
- The engine also accepts prompt slots the course lessons feed later
  (`skills`, `memory`, `specs`, `callers`) plus a `reduce()` map-reduce path.
  The starter server only ever populates diff + system prompt + repo map —
  don't assume the others are wired end-to-end yet.

## Do not touch

- No hard off-limits files, but treat `grounding.ts` and `prompt.ts`'s
  `INJECTION_GUARD` as security-sensitive — a change there affects every
  agent review across the product.
