# DevDigest — root map

Monorepo: `client` (Next.js) · `server` (Fastify + Drizzle) · `reviewer-core` (review engine lib) · `e2e` (flow test runner).

No root package.json — 4 standalone packages, each own lockfile. Cross-package code shared via tsconfig path aliases (`@devdigest/shared`, `@devdigest/reviewer-core`), not published/workspace deps. Run/build/test per-module (see each module's `CLAUDE.md`). Only Postgres runs in Docker; client/server run on host via `pnpm dev`.

## Read when

- touching `client/*` → read `client/CLAUDE.md` first
- touching `server/*` → read `server/CLAUDE.md` first
- touching `reviewer-core/*` → read `reviewer-core/CLAUDE.md` first
- touching `e2e/*` → read `e2e/CLAUDE.md` first
- need cross-module architecture → `docs/architecture.md`
- need agent-prompt tuning → `docs/agent-prompts/README.md`

## Do not touch

- `server/src/db/migrations/` journal — never overwrite wholesale (merge conflicts must append, not replace history). See `server/INSIGHTS.md`.
- `*/src/vendor/shared/` and `client/src/vendor/ui/` — hand-duplicated across packages (no real workspace symlink). Edit both copies or diff before assuming one is source of truth.
