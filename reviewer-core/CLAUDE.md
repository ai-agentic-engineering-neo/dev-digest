# reviewer-core (`@devdigest/reviewer-core`) — agent notes

Pure review engine: diff + repo map → prompt → LLM → grounded findings.
**npm, not pnpm** — own `package-lock.json`.

## Commands

```sh
npm test           # vitest, hermetic — stubbed LLMProvider, no keys, no network
npm run typecheck  # this IS the build: the package emits no JS
```

## Conventions

- Purity is the contract: no DB, filesystem or env access. The only I/O is an
  **injected** `LLMProvider`; anything else belongs in `server/`.
- Consumed as TypeScript source through `server/`'s tsconfig alias — never add a
  build step or a `dist/` import. Stray `src/**/*.js` / `*.d.ts` would shadow the
  sources (they are gitignored for that reason).
- The public API is `src/index.ts`. Changing an export means checking the
  importers in `server/src/platform/*` and `server/src/modules/reviews/*`.
- `@devdigest/shared` resolves to `../server/src/vendor/shared` — the server
  copy, not the client one.
- Untrusted content (diff, PR description, repo map, specs, callers) goes through
  `wrapUntrusted()`; `INJECTION_GUARD` is appended to every system prompt
  (`src/prompt.ts`).

## Gotchas

- The grounding gate drops any finding whose lines don't overlap a new-side hunk
  in the diff. Never add a bypass — it is what stops hallucinated locations.
- The score is recomputed from surviving findings; the model's score is ignored.
  The model's **verdict** is not recomputed.
- The `skills` / `memory` / `specs` prompt slots exist, but the starter server
  never passes them — they are filled in later lessons.

## Read when

- Read [`INSIGHTS.md`](INSIGHTS.md) before starting; append what you learned at
  the end.
- Read [`specs/`](specs/README.md) before implementing an engine feature.
- Read [`docs/`](docs/README.md) before changing prompt assembly, grounding or scoring.
- Read [`README.md`](README.md) for the pipeline diagram and public API.
- Read [`../docs/agent-prompts/`](../docs/agent-prompts/README.md) for the prompt,
  severity, score and verdict conventions every built-in agent relies on.
