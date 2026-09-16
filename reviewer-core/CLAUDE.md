# reviewer-core — agent map

Pure review engine: diff → prompt → LLM → grounded findings. No DB, GitHub, or filesystem access — the only side effect is an LLM call through an injected `LLMProvider`.

## Stack

TypeScript 5.7 · Vitest 2.1 · Zod 3.24 · `openai` SDK 4.77 (used to talk to any OpenAI-compatible provider, incl. OpenRouter)

## Commands

- `npm test` — vitest, hermetic, stubbed `LLMProvider`; no keys, no network
- `npm run typecheck` — doubles as the build; the package never emits JS (consumed as TS source via a tsconfig path alias from `server`)
- `npm run lint`

## Map

| dir/file | what's there |
|---|---|
| `src/prompt.ts` | `assemblePrompt` / `wrapUntrusted` — builds the prompt, fences untrusted content |
| `src/grounding.ts` | `groundFindings` — mechanical citation gate vs. the diff |
| `src/llm/` | `openrouter.ts` (LLMProvider impl), `structured.ts` (Zod → JSON Schema, parse-with-repair) |
| `src/review/` | `run.ts` (orchestrator, single-pass), `reduce.ts` (map-reduce path) |
| `src/output/to-review.ts` | CI payload helper (`toReview`) |
| `src/index.ts` | public API surface |

## Conventions (non-default)

- Score is recomputed deterministically from the **surviving grounded** findings — never trust the model's self-reported score
- Optional prompt slots (`skills`, `memory`, `specs`, `callers`) exist for later course lessons; the starter server passes none — `assemblePrompt` just omits absent sections, this is not a bug

## Gotchas

- A finding without a real diff-line citation is silently dropped by `groundFindings` — if a review looks "thin," check grounding before touching the prompt

## Do-not-touch

- `package-lock.json` — regenerate via `npm install`, never hand-edit

## Session Protocol

- **Start:** before working here, read [INSIGHTS.md](./INSIGHTS.md) and note anything relevant to the task.
- **End:** before finishing, invoke `engineering-insights` — write a new entry only if something substantial and not already recorded came up.

## Docs

- [README.md](./README.md) — pipeline diagram, public API
- [docs/](./docs/) — reference material too detailed for this file
- [docs/specs/](./docs/specs/) — feature specs (SDD)
- [INSIGHTS.md](./INSIGHTS.md) — running log of decisions/gotchas
