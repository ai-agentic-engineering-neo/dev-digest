# reviewer-core — conventions

Setup/run → see [README.md](README.md), не дублюй тут.

Pure TS lib (no HTTP/DB), zod + OpenAI SDK. Layout: `src/review` (pipeline), `src/llm`, `src/output`, `src/prompt.ts`, `src/grounding.ts`. Public surface: `src/index.ts`. Consumed by `server` via tsconfig path alias `@devdigest/reviewer-core` (not a published npm package). Build: `pnpm build` (typecheck only, no bundle). Test: `pnpm test`.

## Read when

- changing review-engine logic → `docs/README.md`
- adding a feature → check `specs/` for its spec first
- hit repeated bug/gotcha → `INSIGHTS.md` first

## Do not touch

**PENDING:** none identified yet.
