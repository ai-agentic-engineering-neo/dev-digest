# reviewer-core — pure review engine: diff → prompt → LLM → grounded findings

## Stack
TypeScript 5 · Zod 3 · vitest · **npm** (has `package-lock.json`, not pnpm)

## Commands
- `npm test` — hermetic, stubbed `LLMProvider`, no network
- `npm run typecheck` — this IS the build (the package never emits JS)

## Map
- `src/index.ts` — the only public entry; consumers import nothing else
- `src/review/` — engine entry point (`reviewPullRequest`) and reduce
- `src/llm/` — structured output + OpenRouter provider

## Conventions
- **No I/O**: no DB, fs, GitHub, env. The only side effect is the injected `LLMProvider`.
  Anything needing I/O stays in the server.
- Consumed as raw TS via tsconfig `paths` (`@devdigest/reviewer-core` → `src`).
  Public API changes ripple straight into `server/` — typecheck it too.
- `@devdigest/shared` resolves to `../server/src/vendor/shared`; `zod` is pinned to
  this package's own `node_modules`.

## Gotchas
- The grounding gate is mandatory: never loosen it to "keep more findings".
- `score` is recomputed from findings; the model's score is ignored.
- PR description / repo map / specs are untrusted — keep them delimiter-wrapped.
- Comments mention an `agent-runner` (CI) consumer; it is not in this repo.

## Docs — read when relevant
- Pipeline diagram, public API → `reviewer-core/README.md`
- Index of deeper docs (incl. agent-prompt conventions) → `reviewer-core/docs/README.md`
- Before implementing a feature → `reviewer-core/specs/README.md`, then the feature spec; no spec → ask
- Before debugging or a non-trivial change → `reviewer-core/INSIGHTS.md`
- Found something non-obvious → append to `reviewer-core/INSIGHTS.md`, not here
