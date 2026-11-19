# reviewer-core — `@devdigest/reviewer-core`

## Map

| Path | What |
|------|------|
| `src/index.ts` | the public API — everything consumers may import |
| `src/review/run.ts` | `reviewPullRequest()` — engine entry: single-pass or map-reduce |
| `src/review/reduce.ts` | merge partial reviews, slice per-file diff, score from findings |
| `src/prompt.ts` | `assemblePrompt`, `wrapUntrusted`, `INJECTION_GUARD` |
| `src/grounding.ts` | citation gate: drop findings that don't cite a real diff line |
| `src/llm/structured.ts` | Zod → JSON Schema, parse-with-repair |
| `src/llm/openrouter.ts` | `OpenRouterProvider` (OpenAI-compatible) |
| `src/output/to-review.ts` | grounded Review → GitHub review payload (CI path) |

## Stack (reviewer-core-only)

npm (`package-lock.json`) · `openai` 4 as the OpenRouter client · zod resolved from this package's own `node_modules` via a tsconfig path alias.

## Conventions

- Pure logic: the only side effect is the injected `LLMProvider`. DB, filesystem, GitHub and persistence stay in the caller.
- Export anything new through `src/index.ts`; consumers import only from there.
- `build` is a type-check; the package ships TypeScript source and never emits JS.

## Gotchas

- Types come from `../server/src/vendor/shared`, so this package type-checks only inside a full checkout.
- Run `npm install` here even though `server/` consumes the source: the zod alias points at `reviewer-core/node_modules/zod`.
- Any change here triggers the `server-unit` CI workflow.
- `score` is recomputed from grounded findings; `verdict` is passed through from the model unchanged.

## Pointers

- Read when you need the pipeline diagram or the public API overview: [README.md](README.md)
- Read when changing prompt assembly, the severity/verdict rules or the `Review` contract: [../docs/agent-prompts/README.md](../docs/agent-prompts/README.md)
- Read when writing or running tests: [../TESTING.md](../TESTING.md)
- Read when you need design notes or how-tos for this module: [docs/](docs/)
- Read when implementing or changing a feature here: [specs/](specs/)
- Read before starting work here and update at the end of the task, via the `engineering-insights` skill: [INSIGHTS.md](INSIGHTS.md)
