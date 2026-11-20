# reviewer-core — `@devdigest/reviewer-core`

The pure review engine: diff → prompt → LLM → structured output → grounding → `Review`.
TypeScript · Zod 3 · openai SDK 4 (OpenRouter provider only) · vitest 2. Uses **npm**.
Never emits JS — `build` is a type-check; the server consumes the `.ts` source directly.

## Commands (npm)
```sh
npm test              # hermetic, stubbed LLMProvider
npm run typecheck     # = build
cd ../server && pnpm typecheck   # also run this: the server compiles this source
```

## Map
```
src/index.ts             public API — the only import surface for consumers
src/prompt.ts            assemblePrompt, wrapUntrusted, INJECTION_GUARD
src/grounding.ts         groundFindings — citation gate against the diff
src/llm/structured.ts    Zod → JSON Schema, extractJson, parseWithRepair
src/llm/openrouter.ts    OpenRouterProvider
src/review/run.ts        reviewPullRequest — single-pass / map-reduce entry point
src/review/reduce.ts     merge per-file reviews, scoreFromFindings
src/output/to-review.ts  toReview — CI payload (used from M6)
test/                    vitest
```

## Rules
- **No I/O.** No DB, fs, GitHub, or `process.env`. The only side effect is the injected
  `LLMProvider`. Anything that loads data belongs in `server/` and is passed in as a string.
- Export new public API from `src/index.ts`. The server re-exports some of it through
  shims in `server/src/platform/*.ts`.
- Optional prompt slots (`skills`, `memory`, `specs`, `callers`, `repoMap`) are omitted
  from the prompt when empty — keep that true for any slot you add.

## Gotchas
- `@devdigest/shared` resolves to `../server/src/vendor/shared` (tsconfig `paths`). Contract
  types are the server's copy, not the client's.
- `zod` is pinned to this package's own `node_modules`, so a different zod instance is
  loaded than the server's. `instanceof ZodError` is unreliable across the boundary — the
  server matches errors by shape.
- `DEFAULT_MAP_THRESHOLD_LINES` / `DEFAULT_REVIEW_MAX_RETRIES` in `review/run.ts` are the
  effective defaults (comments claim they mirror server constants that no longer exist).

## Do not touch
- **The grounding gate:** findings that don't cite a real diff line are dropped, and the
  score is recomputed from the survivors. Never trust or keep the model's own score.
- **`INJECTION_GUARD`:** prompt-injection defense is one trusted rule in the system prompt.
  Don't add keyword scanning of untrusted text, and never let PR content descope a review.

## Read when
- You need the pipeline overview or the public API list → `README.md`.
- You change how agent prompts are combined → `../docs/agent-prompts/README.md`.
- You need to know what the server feeds into the engine → `../server/README.md` (Review context).
- You write engine tests → `../TESTING.md`.
- You start a feature → write the spec in `specs/` first; design notes → `docs/`.
- Before a non-trivial change → `INSIGHTS.md`; append what you learn.
