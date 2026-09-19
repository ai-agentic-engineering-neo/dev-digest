# reviewer-core — conventions

Setup/run → see [README.md](README.md), не дублюй тут.

Pure TS lib (no HTTP/DB), zod + OpenAI SDK. Layout: `src/review` (pipeline), `src/llm`, `src/output`, `src/prompt.ts`, `src/grounding.ts`. Public surface: `src/index.ts`. Consumed by `server` via tsconfig path alias `@devdigest/reviewer-core` (not a published npm package) — there is no standalone "run"; it only executes inside `server`'s process or its own tests. Build: `pnpm build` (typecheck only, no bundle). Test: `pnpm test`. Typecheck: `pnpm typecheck`. Lint: not configured.

## Read when

- changing review-engine logic → `docs/README.md`
- adding a feature → check `specs/` for its spec first
- adding a dependency or capability (tokenizer, clock, LLM) → `.claude/skills/onion-architecture/SKILL.md` (core defines the port, server injects it; checked by `pnpm arch` in server)
- **before any work → `INSIGHTS.md` (read first, always)**

## Naming

`src/<stage>.ts` per pipeline stage (`prompt.ts`, `grounding.ts`, …), each a small set of named exports re-surfaced from `src/index.ts` — no default exports, no `utils.ts` grab-bag. See root `CLAUDE.md` § Naming for the full convention.

## Do not touch

- `package-lock.json` — never hand-edit; regenerate via `npm install` after a `package.json` change.
