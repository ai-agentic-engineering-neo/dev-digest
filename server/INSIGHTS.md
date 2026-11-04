# server — insights

Non-obvious lessons learned while working in `server/`. Maintained by the `engineering-insights` skill.
Append-only: new lines go at the end of their section; corrections are new dated entries.
Format: `- YYYY-MM-DD — <what is true / what happened> → <what to do instead> (path:line → symbol)`.
Add an entry only if forgetting it would make an agent (or a human) repeat the mistake.

## What Works
<!-- Approaches that proved effective here -->

## What Doesn't Work
<!-- Dead ends and antipatterns — the most valuable section -->

## Codebase Patterns
<!-- Conventions and architecture decisions, with the reason -->
- 2026-11-04 — There is no base-repository/workspace guard; scoping is manual per query → always add `eq(t.x.workspaceId, workspaceId)` from `getContext` (src/modules/_shared/context.ts:14 → getContext).
- 2026-11-04 — `ReviewService` builds `new ReviewRepository(container.db)` instead of `container.reviewRepo` → can't be swapped via overrides; prefer the container getter in new code (src/modules/reviews/service.ts:34 → ReviewService constructor).
- 2026-11-04 — `reviewPullRequest` already returns `costUsd`, but the executor drops it and `agent_runs.cost_usd` was removed in migration 0009; on a thrown chunk all usage is lost and the failure path writes tokens 0 → to persist partial spend, collect per-chunk usage via a callback, not from `outcome` (src/modules/reviews/run-executor.ts:139 → runOneAgent, partial spend via `UsageTally` at :157; spec: specs/run-cost-badge.md).

## Tool & Library Notes
<!-- Dependency / tooling quirks -->
- 2026-11-04 — pgvector is enabled only by `runMigrations()` (`src/db/migrate.ts`), no migration .sql does it → migrate via `pnpm db:migrate`, never `drizzle-kit migrate`, or `vector(1536)` columns fail (src/db/migrate.ts:23 → runMigrations).
- 2026-11-04 — On Windows `pnpm <script>` can fail with "Access is denied" → call bins via node: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`, `node node_modules/vitest/vitest.mjs run --exclude '**/*.it.test.ts'`, `node node_modules/drizzle-kit/bin.cjs generate` (package.json → scripts).

## Recurring Errors & Fixes
<!-- Symptom → root cause → fix -->
- 2026-11-04 — `test/indexer-pipeline.test.ts` (runIncremental, 6 tests) fails on Windows with ENOENT: its `writeFileAt` helper splits paths on `'/'` only → pre-existing, unrelated to feature work; don't chase it as a regression (test/indexer-pipeline.test.ts:140 → writeFileAt).
- 2026-11-04 — On Windows `db:migrate` / `db:seed` exit 0 with NO output and create no tables: the CLI guard `import.meta.url === \`file://${process.argv[1]}\`` never matches (`file:///F:/…` vs `F:\…`) → verify with `docker exec devdigest-postgres psql -U devdigest -d devdigest -c '\dt'`; workaround: a temp `.mts` that imports and awaits `runMigrations(url)` and `seed(createDb(url).db)`, run via `node node_modules/tsx/dist/cli.mjs` (src/db/migrate.ts:37, src/db/seed.ts:227 → CLI entrypoint guard).

## Session Notes
<!-- Wrap-up: one dated line per substantive task -->
- 2026-11-04 — Specced + implemented Run Cost Badge (`agent_runs.cost_usd` via migration 0010, `UsageTally` partial spend, PR-list SUM) → specs/run-cost-badge.md.
- 2026-11-04 — First local launch on Windows (Docker Postgres + migrate/seed workaround), PR #1 reviewed end-to-end via OpenRouter agents.

## Open Questions
<!-- Unresolved items, known gaps -->
- 2026-11-04 — `GET /runs/:id/events`, `POST /runs/:id/cancel`, `GET /runs/:id/trace`, `GET /repos/:id/index-state` call `getContext` but ignore `workspaceId` (harmless while single-workspace) → scope them before adding real auth (src/modules/reviews/routes.ts:49/:114/:121, src/modules/repo-intel/routes.ts:33).
