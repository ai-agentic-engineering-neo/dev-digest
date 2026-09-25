# server — INSIGHTS

Append-only engineering insights for `server/`. Written by the `engineering-insights`
skill (`.claude/skills/engineering-insights/`), read at the start of any task that
touches this package. Fixed sections; one dated entry per line; never rewrite an
entry, correct it with a new dated one. Rule: if anyone reading the code would
see it, do not write it.

## What Works

- [2026-09-25] Injecting mock adapters through `ContainerOverrides` keeps every non-`.it.test.ts` test hermetic; no key, network, or Docker needed. Evidence: `server/src/platform/container.ts:40`.
- [2026-09-25] To get a FAILED run in an `.it.test.ts` without a network, pass `MockLLMProvider` a `structured` fixture that fails the Review schema (e.g. `{ not: 'a review' }`): the mock throws, the executor persists status=failed with cost null. Evidence: `server/test/reviews.it.test.ts:a failed run persists a null cost`.

## What Doesn't Work

- [2026-09-25] Reading API keys from `process.env` in feature code. They never reach `AppConfig`; the only reader is `LocalSecretsProvider`, which checks `~/.devdigest/secrets.json` first and env second. Evidence: `server/src/platform/config.ts:9`.
- [2026-09-25] Running the server with more than one API instance per database. Boot reaps every `agent_runs` row in `running` state, so a second replica would kill the first one's live runs. Evidence: `server/src/app.ts:81`.

## Codebase Patterns

- [2026-09-25] `src/vendor/shared` is the canonical `@devdigest/shared`; `client/src/vendor/shared` is a copy and has drifted in `adapters.ts`, `eval-ci.ts`, `knowledge.ts`, `productionize.ts`, `trace.ts`. Change here, then copy over.
- [2026-09-25] Repo-intel sections of the review prompt stay empty until the repo is indexed; an unindexed repo silently reviews diff-only. Gates: `REPO_INTEL_ENABLED` and per-agent `agents.repo_intel`. Evidence: `server/src/modules/reviews/run-executor.ts:168`.
- [2026-09-25] Global rate limit is skipped when `NODE_ENV=test` so integration suites can hammer routes through `inject()`; per-route caps still apply. Evidence: `server/src/app.ts:95`.
- [2026-09-25] `GITHUB_TOKEN` is canonical; `GITHUB_PAT` is read only as a fallback. Evidence: `server/src/adapters/secrets/local.ts:40`.
- [2026-09-25] `server/clones/` is git-ignored runtime data and no test suite collects it.
- [2026-09-25] PR-list cost (`PrMeta.cost_usd`) is a read-time rollup: sum of `agent_runs.cost_usd` over done runs with a non-null cost, absent → null so the UI shows «—». Rejected: a denormalized column on `pull_requests`, which would drift on run delete. Run cost itself is stored at completion, never recomputed from current prices. Evidence: `server/src/modules/reviews/repository/run.repo.ts:costRollupForPulls`.

## Tool & Library Notes

- [2026-09-25] `err instanceof z.ZodError` fails when shared and api load separate zod instances; the error handler also matches by `name === 'ZodError'` plus an `issues` array. Evidence: `server/src/app.ts:141`.
- [2026-09-25] The server type-checks and imports reviewer-core's raw TypeScript through a path alias, so `reviewer-core/node_modules` must exist. Evidence: `server/tsconfig.json:24`.
- [2026-09-25] simple-git dumps the full clone command — INCLUDING the `x-access-token:<PAT>@` URL — into the thrown GitError, so a failed authenticated clone writes the GitHub token to the API log. Treat dev logs as secret-bearing until that URL is masked. Evidence: `server/src/modules/repos/service.ts:withGitHubToken`.

## Recurring Errors & Fixes

- [2026-09-25] `TS2307: Cannot find module 'openai'` during `pnpm typecheck` or unit tests. Fix: `cd reviewer-core && npm ci` first. Evidence: `.github/workflows/server-unit.yml`.
- [2026-09-25] `relation "…" does not exist` on first API call. Migrations never run on boot. Fix: `cd server && pnpm db:migrate`.
- [2026-09-25] Boot fails on `LOG_LEVEL=` (empty) because `''` is not an enum member. Fixed by coercing empty to undefined in config. Evidence: `server/src/platform/config.ts:36`.
- [2026-09-25] API dies silently after `POST /repos/:id/refresh` (log ends with a simple-git stack + bare `Node.js v22…`; browser shows connection refused): a failed job's `done` promise rejected with nobody awaiting it. Fixed: `JobRunner.enqueue` attaches its own catch (logs via `setLogger`) and `server.ts` installs an `unhandledRejection` net. `tsx watch` does NOT restart after a crash — touch a file. Evidence: `server/src/platform/jobs.ts:enqueue`.

## Session Notes

- [2026-09-25] Initial capture from a read-through of the starter: DI, module trio, schema, config, tests. No code changed.
- [2026-09-25] L01 run cost: re-added agent_runs.cost_usd (migration 0010), cost on RunStats/RunSummary/PrMeta, list rollup, seeded priced run; all suites green. Client fixtures patched for the required cost_usd field. Evidence: `server/specs/run-cost-badge.md`.

## Open Questions

- [2026-09-25] Stale-run reaping assumes one API process per DB. What replaces it if the API is ever scaled horizontally: heartbeats or per-instance run ownership?
