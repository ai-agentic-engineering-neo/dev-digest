# CLAUDE.md — `@devdigest/reviewer-core`

The review engine: **diff → prompt → LLM → grounded findings**. Pure logic. No database, GitHub, or filesystem; the only side effect is a call to an **injected** `LLMProvider`. That purity is the point — it keeps the engine mock-testable and lets the studio and (from L06) CI run identical review logic.

Package overview → [README.md](README.md) · pipeline detail → [docs/pipeline.md](docs/pipeline.md) · invariants → [specs/grounding-and-scoring.md](specs/grounding-and-scoring.md) · hard-won findings → [INSIGHTS.md](INSIGHTS.md)

## Stack

TypeScript (ESM) · Zod contracts from `@devdigest/shared` · `openai` SDK only for the OpenAI-compatible OpenRouter client · vitest.

## Commands

```sh
npm test         # vitest, hermetic, stubbed LLMProvider — no keys, no network
npm run typecheck
npm run build    # type-check only; this package never emits JS
```

## Where things live

| Path | What |
|------|------|
| `src/index.ts` | the public API — the only surface consumers may import |
| `src/prompt.ts` | `assemblePrompt`, `wrapUntrusted`, the shared `INJECTION_GUARD` |
| `src/review/run.ts` | `reviewPullRequest` — the entry point, mode selection, orchestration |
| `src/review/reduce.ts` | map-reduce merge, diff slicing, deterministic scoring |
| `src/grounding.ts` | the citation gate |
| `src/llm/structured.ts` | Zod → JSON Schema, `extractJson`, `parseWithRepair` |
| `src/llm/openrouter.ts` | the one OpenAI-compatible structured provider |
| `src/output/to-review.ts` | grounded review → GitHub review payload, blocker counting |
| `test/` | hermetic unit tests |

## Non-default conventions

- **No I/O.** Anything needing a DB, GitHub, the filesystem, or process env belongs in the caller. Resolved strings come *in* (the caller turns skill slugs into bodies, memory into items, specs into chunks).
- Consumers import through a tsconfig path alias straight to **source**. There is no build artifact, so `build` is a type-check.
- Everything public is exported from `src/index.ts`; consumers must not deep-import internal files.
- Optional prompt slots (`skills`, `memory`, `specs`, `callers`, `repoMap`, `prDescription`) follow an omit-when-empty contract: absent slot ⇒ the section does not appear at all.
- Cancellation is caller-owned: the engine calls an injected `checkCancelled()` that throws; it defines no error type of its own.
- Contracts come from `@devdigest/shared`; this package does not define its own review types.

## Gotchas

- **The grounding gate is mandatory.** A finding that does not cite a real line in the diff is dropped. Do not add a path that persists ungrounded findings.
- **The model's self-reported score is discarded** and recomputed from the surviving findings. Changing the penalty table changes every score in the product.
- The injection guard is one trusted rule appended to every system prompt. Do **not** replace it with keyword scanning of untrusted text — a denylist only ever catches one phrasing in one language.
- `auto` strategy picks map-reduce only when the diff is both large and multi-file; a single-file diff is always one call.
- Structured output goes through parse-with-repair and a retry budget — models return near-JSON often enough that this is load-bearing.
- The package is consumed as TypeScript source, so a type error here breaks the server's dev run, not just this package's build.

## Do not touch

- The purity rule: no `node:fs`, `node:child_process`, DB clients, or network calls other than through the injected `LLMProvider`.
- The engine-owned pipeline order in `review/run.ts`: assemble → complete → reduce → **ground** → score.
- `src/index.ts` exports are the consumer contract; removing or renaming one breaks the server and the CI runner together.
