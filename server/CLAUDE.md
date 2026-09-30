# server (`@devdigest/api`)

## Overview

Fastify 5 + Drizzle ORM (Postgres/pgvector) API — clones/indexes repos,
stores agents, runs the reviewer (diff → `reviewer-core` → grounded
findings). It is the client's only backend.

## Commands

- `pnpm dev` — API on `:3001`.
- `pnpm db:migrate` / `pnpm db:seed` / `pnpm db:generate`.
- Tests split by filename:
  - `pnpm exec vitest run --exclude '**/*.it.test.ts'` — unit, hermetic, no
    Docker.
  - `pnpm exec vitest run .it.test` — integration, real Postgres via
    testcontainers.
  - `pnpm test` — both.
- `pnpm typecheck`.

## Conventions

- Adapters (LLM, GitHub, git, ast-grep, secrets, …) sit behind a DI container
  (`platform/container.ts`) so tests can swap in mocks.
- Modules are self-contained plugins under `src/modules/<name>/`, registered
  statically in `src/modules/index.ts`. Plugins (helmet, cors, rate-limit,
  SSE, error handler) register **before** modules so every module inherits
  them.
- Route validation is schema-first: Zod contracts from `src/vendor/shared`
  double as route schemas via `fastify-type-provider-zod` — one definition
  drives both request validation and response serialization. Handlers must
  **not** hand-roll `Schema.parse(req.body)` — invalid input is already
  rejected with `422` before the handler runs.
- Tests go through `src/adapters/mocks.ts` (`MockLLMProvider`,
  `MockGitClient`, …) — never real network calls or keys in unit tests.
- The engine reaps orphaned `running` runs on boot.
- The DB schema intentionally contains **every** table for the whole course —
  tables with no reads/writes yet aren't dead code.
- `db/schema/eval.ts` and `vendor/shared/contracts/eval-ci.ts` are scaffolding
  for the future L06 eval-pipeline lesson; nothing routes through them yet.
- Global rate limit is 120/min, disabled under `NODE_ENV=test`; SSE and
  `/health*` are exempt.

## Do not touch

- `server/clones/**` — git-ignored clone dir (`DEVDIGEST_CLONE_DIR`); runtime
  data only, may contain unrelated nested repos.
- `server/package.json` — `skip-worktree`; see root `CLAUDE.md`.
- `~/.devdigest/secrets.json` access outside `LocalSecretsProvider`
  (`src/adapters/secrets/local.ts`) — it is the one read chokepoint by
  design. `GITHUB_TOKEN` is canonical; `GITHUB_PAT` is an accepted fallback,
  not a separate source of truth.
- The `INJECTION_GUARD` / grounding gate wiring in the review pipeline —
  don't relax it to make a review "pass"; see reviewer-core's `CLAUDE.md`.

## Gotchas

- A DB-backed test (imports `test/helpers/pg.ts`) **must** be named
  `*.it.test.ts`, or it silently lands in the wrong CI lane.
- Integration tests self-skip when Docker is unavailable — a green
  integration run locally without Docker likely means it didn't execute.
- Secrets are **not** part of `AppConfig`/`loadConfig` — every secret is
  optional there by design; look in `SecretsProvider` instead.
- `REPO_INTEL_ENABLED` defaults to `true`; an unindexed repo degrades
  silently to diff-only context — that's expected, not a missing feature.

## Reference

- `server/README.md` — read first: request/DI flow diagram, full API map,
  env var table.
- `../TESTING.md` — read before any test change.
- `../docs/agent-prompts/README.md` — read before touching
  `modules/reviews/run-executor.ts` or prompt assembly in
  `reviewer-core/prompt.ts`.
- `server/src/modules/repo-intel/README.md` — read before touching
  repo-intel indexing/ranking.
- `../reviewer-core/README.md` — read before touching what the server sends
  into the review engine.
- `server/docs/`, `server/specs/` — deeper design notes / formal specs;
  currently empty placeholders, read when populated.
- `../.claude/rules/` — always-applied project rules; authoritative over
  this file if it ever contains anything.
