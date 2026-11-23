# server — @devdigest/api

Fastify 5 + Drizzle + Postgres. Deep docs (API map, DI flow, env table): `README.md`.

## Rules
- New feature = new `modules/<name>/` plugin (routes → service → repository), registered in `modules/index.ts`.
- Routes declare zod `params`/`body`; never hand-parse `req.body`.
- Reach the outside world only through adapters via `platform/container.ts`.
- Tighter rate-limit caps on expensive routes (global is 120/min).
- DB-backed test ⇒ `*.it.test.ts` and import `test/helpers/pg.ts`.

## Gotchas
- Review context is assembled in `modules/reviews/run-executor.ts`; repo-intel only contributes once the repo is indexed.
- Findings must cite a diff line or are dropped; score is recomputed, never trust the model's.
- Never keyword-scan for prompt injection; `INJECTION_GUARD` is the single defense.
- `src/vendor/shared` has a drifted twin in `client/` — keep in sync.
- Boots with no API keys; keys come from SecretsProvider or env.
- Migrations are generated (`pnpm db:generate`) and applied manually (`pnpm db:migrate`).

## Look here when relevant (not auto-loaded)
- Module details: `src/modules/repo-intel/README.md`
- `docs/` explanations · `specs/` feature briefs · `INSIGHTS.md` learned gotchas
- Test strategy: `../TESTING.md`
- Layering (which ring code belongs in, import direction): skill `onion-architecture` (`.claude/skills/onion-architecture/`)
