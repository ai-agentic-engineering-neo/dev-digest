# DevDigest — agent guide

Local-first AI PR reviewer. Course starter: Part-0 works end to end; each lesson adds one feature.

## Before answering

Always search the relevant package's `docs/`, `specs/`, and `INSIGHTS.md` for what the
user asks about FIRST — these are curated and may already answer it — then read code.
Every package has an `INSIGHTS.md`; the root one holds only what crosses package
boundaries. They record drift and traps the code and READMEs do not admit to. Each
package's `CLAUDE.md` lists which of `docs/` and `specs/` exist there today.

## Session protocol

- **Before changing anything** — read the root `INSIGHTS.md` and the one for the module you are about to work in, then state in a line or two which entries bear on this task. Stating it is the check that you actually read it.
- **After any task that involved debugging, investigation, or a design call** — use the `engineering-insights` skill to record what was learned. Do not skip this step. Recording nothing is a valid outcome; skipping the check is not.

## Conventions (not obvious from code)

- NOT a monorepo workspace — each package has its own `package.json`/lockfile; cross-package code is shared via tsconfig path aliases.
- Modules are registered statically in `server/src/modules/index.ts` (no filesystem autoload).
- ESM: relative imports carry the `.js` extension — in `server/` and `reviewer-core/` only. `client/` is a Next.js bundler target and omits it.
- `@devdigest/shared` exists as **two** physical copies: `server/src/vendor/shared/` (canonical) and `client/src/vendor/shared/` (mirror). There is no sync script and the mirror already lags — change the canonical copy, then port the delta by hand.

## Do-not-touch

- `server/src/vendor/shared/` and `server/src/db/migrations/` — never hand-edit without coordination.

## Use when

- Stack, commands, architecture, how to run → read `README.md`
- Testing & CI strategy, which suite runs when → read `TESTING.md`
- Something looks inconsistent, stale, or duplicated → check `INSIGHTS.md` before "fixing" it
- Working inside a package → read that package's CLAUDE.md: `server/CLAUDE.md`, `client/CLAUDE.md`, `reviewer-core/CLAUDE.md`, `e2e/CLAUDE.md`
- Agent prompt templates → read `docs/agent-prompts/`
- Framework rules (Fastify · Drizzle · Postgres · Next · React · Zod · security) → read `.claude/skills/`
