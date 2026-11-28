# server — engineering insights

Append-only log of non-obvious findings, written by agents via the
`engineering-insights` skill. Newest entries at the bottom of each section.
Review and prune periodically; stale entries are harmful.

## Non-obvious dependencies

- **2026-11-28** · The PR list's run cost comes from the `run_traces.trace` jsonb (`stats.cost_usd`), read with a single jsonb path so the whole log document is not loaded; traces written before that field existed fall back to `priceBook.estimate(model, tokens)` — evidence: `server/src/modules/pulls/routes.ts:144`, `server/src/modules/pulls/cost.ts:24`

## Fixes & gotchas

- **2026-11-28** · Integration tests (`*.it.test.ts`) skip silently ("7 skipped") when the Docker daemon is not running, even if the `docker` CLI exists; start `dockerd` (or Docker Desktop) and re-run, a skip is not a pass — evidence: `server/test/helpers/pg.ts:23`
- **2026-11-28** · `test/git-adapter-safety.test.ts` fails in sandboxes that inject `GIT_SSL_CAINFO` / `GIT_CONFIG_*` (simple-git's env guard rejects them); it fails identically on untouched `main`, so treat it as environmental, not a regression — evidence: `server/test/git-adapter-safety.test.ts:62`, `server/src/adapters/git/simple-git.ts:47`

## Measured facts

- **2026-11-28** · Server unit lane: 22 files / 181 tests in ~5 s; `test/reviews.it.test.ts` with a testcontainers Postgres ~13 s — evidence: `pnpm exec vitest run --exclude '**/*.it.test.ts'`, `pnpm exec vitest run test/reviews.it.test.ts`

## Surprises

- **2026-11-28** · reviewer-core already summed the run's `costUsd` over all model calls, but the executor destructured only tokens and dropped the cost, so it was never persisted or logged; it is now written to `trace.stats.cost_usd` and a `Usage: … cost $X` log line — evidence: `reviewer-core/src/review/run.ts:184`, `server/src/modules/reviews/run-executor.ts:270`
- **2026-11-28** · A PR's "latest run" for cost is the newest `agent_runs` row with `status='done'`; with "Run all agents" each agent is a separate run, so the badge shows the last agent's cost, not the batch sum — evidence: `server/src/modules/pulls/routes.ts:148`
