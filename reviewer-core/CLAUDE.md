# reviewer-core — `@devdigest/reviewer-core`

## Commands (npm, not pnpm)
- `npm test` · `npm run typecheck` (this *is* the build — the package never emits JS)

## Read when
- Changing prompt assembly, structured output or grounding → read `README.md` (pipeline, public API)
- Changing what the server feeds in → read `../server/README.md#review-context-non-obvious`
- Implementing a planned feature → look for its spec in `specs/`
- Before any change → read `INSIGHTS.md` (high-confidence guidance; append via `/engineering-insights`)

## Conventions (non-default)
- Stays **pure**: no DB, GitHub, filesystem or env access. The only side effect is
  the injected `LLMProvider`.
- Consumed as TypeScript source via the server's tsconfig alias
  (`../reviewer-core/src`) — a type error here breaks the server build.
- Public surface = `src/index.ts`. Export anything new from there.
- Contracts (`Review`, `Finding`, …) come from `@devdigest/shared`, resolved to
  `../server/src/vendor/shared`.

## Gotchas
- Optional prompt slots (`skills`, `memory`, `specs`, `callers`) are unused in the
  starter; `assemblePrompt` omits empty sections — keep that behaviour.
- The score is recomputed from surviving findings; the model's own score is ignored.

## Do not touch (without an explicit decision)
- `INJECTION_GUARD` / `wrapUntrusted` — defense is one trusted rule, never keyword scanning.
- Grounding gate (`grounding.ts`): findings without a real diff line are dropped.
