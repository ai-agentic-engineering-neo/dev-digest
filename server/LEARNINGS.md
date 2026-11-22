# server — learnings

Lessons captured while working in this module, written by the
`engineering-insights` skill. Append-only: add entries, never rewrite or delete
them; correct an entry by appending a new dated one that names it. Curated
facts about the module, where the module keeps them, are in `INSIGHTS.md`.

Entry format:
`- YYYY-MM-DD — <specific lesson and the action to take>. Evidence: path:line`

## What Works

<!-- Approaches and solutions that worked here. -->

## What Doesn't Work

<!-- Dead ends and antipatterns. The most valuable section; do not skip it. -->

- 2026-11-22 — Do not rely on the PR list sync to import every open PR: `listPullRequests` reads one page — the 50 most-recently-updated PRs with `state: 'all'` — so on a repo with more than 50 PRs an open PR nobody touched lately is silently absent (importing `ai-agentic-engineering-neo/dev-digest` brought 4 of its 5 open PRs; #14 was cut off). `GET /repos/:id/pulls` and `POST /repos/:id/poll` both go through that call and no route imports a PR by number. To fix it, paginate or add a `state: 'open'` pass in the adapter; as a stopgap, one row in `pull_requests` with the importer's columns is enough — `GET /pulls/:id` then loads files, commits and body from GitHub. Evidence: server/src/adapters/github/octokit.ts:42

## Codebase Patterns

<!-- Conventions and structure that are not obvious from one file. -->

- 2026-11-21 — Run cost is already computed per LLM call (OpenRouter `usage.cost`, else `estimateCost`) and summed by reviewer-core into `ReviewOutcome.costUsd`; to surface it, persist it in `run-executor` — never add a model call or recompute from tokens. Failed/cancelled paths hard-code tokens 0 and cost null, so read cost only from `status='done'` runs. Evidence: server/src/modules/reviews/run-executor.ts:214

## Tool & Library Notes

<!-- Quirks of dependencies and tooling. -->

## Decisions

<!-- A decision and the reason for it. -->

- 2026-11-21 — M1 cost badge edited the existing `reviews` and `pulls` modules instead of adding a new module: the cost originates in `reviews` and the list route lives in `pulls`; a new module would only duplicate those reads. `PrMeta.last_run_cost_usd` = newest `done` run, so a running/failed newer run never replaces it with a fake price. Evidence: server/src/modules/pulls/routes.ts:172

- 2026-11-22 — Corrects the 2026-11-21 entry above: the PR list cost is now `PrMeta.total_cost_usd`, the sum of `cost_usd` over every run on the PR, because the list should show what the PR cost in total, not the last run. It sums runs with a stored cost and has no `status` filter (failed and cancelled runs store null, so they add nothing), and it is null when no run has a known cost; keep per-run cost on `RunSummary.cost_usd`. The sum is rounded to 10 decimals so float addition noise does not reach the client's unrounded hover value. Evidence: server/src/modules/pulls/routes.ts:175

## Recurring Errors & Fixes

<!-- An error seen more than once, with its fix. -->

## Session Notes

<!-- One dated line per work session. -->

- 2026-11-21 — Added CLAUDE.md, INSIGHTS.md, docs/ and specs/ for the package; no source code changed.

- 2026-11-21 — Built M1 run cost badge (server): `agent_runs.cost_usd` (migration 0010), cost in RunSummary/RunStats/PrMeta, idempotent seeded run for PR #482; spec server/specs/M1-cost-badge.md.

- 2026-11-22 — Imported the upstream repo `ai-agentic-engineering-neo/dev-digest` into the local app through the API (repo, clone, index, 50 PRs) and added its open PR #14 as a hand-written row; no source code changed.

- 2026-11-22 — Changed the PR list cost from the latest run to the total of all runs: `PrMeta.last_run_cost_usd` renamed to `total_cost_usd` in both contract copies, `pulls/routes.ts`, specs and tests updated.

## Open Questions

<!-- What is still unresolved. -->

- 2026-11-21 — `TESTING.md` says `server/package.json` is `skip-worktree`, but `git ls-files -v` shows no skip-worktree file in this clone. Until confirmed, run the test split with `pnpm exec vitest run …` as CI does and do not add `test:unit` / `test:integration` scripts. Evidence: TESTING.md:83
