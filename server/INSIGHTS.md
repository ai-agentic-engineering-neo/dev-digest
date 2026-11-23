# Insights — server

Non-obvious findings for agents working in this package, written via the `engineering-insights` skill.
Entries are hints to verify, not rules: if the code disagrees, the code wins — add a `contradicted` comment.
Add only: new entries go last in their section; comments go as indented sub-bullets under the entry they refer to.
Format: `` - YYYY-MM-DD · <insight> — <why>. Evidence: `path` (`symbol`) `` — no line numbers.
Hygiene: monthly `/engineering-insights review` (logged under Review log); split into `INSIGHTS-<domain>.md` past ~100 entries.

## Patterns

## Mistakes

## Decisions

## Context
- 2026-11-23 · Per-run cost is computed but not stored: run-executor destructures only tokens from the review outcome and drops `costUsd`; migration 0009 dropped `agent_runs.cost_usd` on purpose (L01 "Run cost badge" lab). Evidence: `server/src/modules/reviews/run-executor.ts` (`completeAgentRun` call), `server/src/db/migrations/0009_complex_runaways.sql`
- 2026-11-23 · The seed creates no `agent_runs` / `run_traces`, so seeded PRs show no tokens, duration or cost — test run-level UI with fixtures or a real review. Evidence: `server/src/db/seed.ts` (`seed`)
- 2026-11-23 · On this Colima machine run integration tests as `DOCKER_HOST=$(docker context inspect --format "{{.Endpoints.docker.Host}}") TESTCONTAINERS_RYUK_DISABLED=true pnpm exec vitest run .it.test` — without it testcontainers fails with "Could not find a working container runtime strategy" although `docker info` works (verified together; Ryuk flag not tested separately). Evidence: `server/test/helpers/pg.ts`

## Open Questions

## Review log
