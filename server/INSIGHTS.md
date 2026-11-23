# server — insights

What the code of this module does not show: lasting facts about it, and the
lessons of past work sessions. Read it before working here. It is the one place
for this knowledge: the `engineering-insights` skill appends to it, and people
edit it.

- **Key Facts** is curated. Edit or remove an entry when it stops being true.
  Format: `### YYYY-MM-DD — short title`, then **What happened**, **Why** and
  **Rule**.
- Every other section is append-only. Add entries, never rewrite or delete
  them; correct one by appending a new dated entry that names it. Format:
  `- YYYY-MM-DD — <specific lesson and the action to take>. Evidence: path:line`

## Key Facts

<!-- Lasting facts about the module, promoted from the sections below. -->

### 2026-11-21 — The two `@devdigest/shared` copies have already drifted

**What happened:** `server/src/vendor/shared` and `client/src/vendor/shared`
differ in five files (`adapters.ts`, and `contracts/eval-ci.ts`,
`knowledge.ts`, `productionize.ts`, `trace.ts`).

**Why:** the contracts are vendored per package, and nothing checks that the
copies match.

**Rule:** when changing a contract, apply the change to both copies in the same
commit, and diff the two folders before relying on a contract that the client
also uses.

## What Works

<!-- Approaches and solutions that worked here. -->

## What Doesn't Work

<!-- Dead ends and antipatterns. The most valuable section; do not skip it. -->

- 2026-11-22 — Do not rely on the PR list sync to import every open PR: `listPullRequests` reads one page — the 50 most-recently-updated PRs with `state: 'all'` — so on a repo with more than 50 PRs an open PR nobody touched lately is silently absent (importing `ai-agentic-engineering-neo/dev-digest` brought 4 of its 5 open PRs; #14 was cut off). `GET /repos/:id/pulls` and `POST /repos/:id/poll` both go through that call and no route imports a PR by number. To fix it, paginate or add a `state: 'open'` pass in the adapter; as a stopgap, one row in `pull_requests` with the importer's columns is enough — `GET /pulls/:id` then loads files, commits and body from GitHub. Evidence: server/src/adapters/github/octokit.ts:42

## Codebase Patterns

<!-- Conventions and structure that are not obvious from one file. -->

- 2026-11-21 — Run cost is already computed per LLM call (OpenRouter `usage.cost`, else `estimateCost`) and summed by reviewer-core into `ReviewOutcome.costUsd`; to surface it, persist it in `run-executor` — never add a model call or recompute from tokens. Failed/cancelled paths hard-code tokens 0 and cost null, so read cost only from `status='done'` runs. Evidence: server/src/modules/reviews/run-executor.ts:214

- 2026-11-23 — A review seeded on PR #482 must be dated before the seeded Security Reviewer review. The newest review on a PR drives the list's score and is the run the Agent runs tab opens by default, and e2e flow 04 asserts that run's `2 findings` and `1 CRITICAL`; a newer seeded review would take both over. Each seeded block also needs its own idempotency check (the Performance Reviewer block keys on a `model = 'seed'` review by that agent), because the first block's "PR has any run" check would skip it on a database that was seeded earlier. Evidence: server/src/db/seed.ts:333

## Tool & Library Notes

<!-- Quirks of dependencies and tooling. -->

## Decisions

<!-- A decision and the reason for it. -->

- 2026-11-21 — M1 cost badge edited the existing `reviews` and `pulls` modules instead of adding a new module: the cost originates in `reviews` and the list route lives in `pulls`; a new module would only duplicate those reads. `PrMeta.last_run_cost_usd` = newest `done` run, so a running/failed newer run never replaces it with a fake price. Evidence: server/src/modules/pulls/routes.ts:172

- 2026-11-22 — Corrects the 2026-11-21 entry above: the PR list cost is now `PrMeta.total_cost_usd`, the sum of `cost_usd` over every run on the PR, because the list should show what the PR cost in total, not the last run. It sums runs with a stored cost and has no `status` filter (failed and cancelled runs store null, so they add nothing), and it is null when no run has a known cost; keep per-run cost on `RunSummary.cost_usd`. The sum is rounded to 10 decimals so float addition noise does not reach the client's unrounded hover value. Evidence: server/src/modules/pulls/routes.ts:175

- 2026-11-23 — The PR list's `PrMeta.findings_counts` is summed over each agent's latest review on the PR (`kind = 'review'`, newest first, one per `prId|agentId`, reviews without an agent share one key), not over the PR's single latest review: a PR reviewed by several agents must show all of them, and a re-run must replace that agent's earlier findings instead of adding to them. It counts every stored finding, dismissed and low-confidence ones included, to match `N findings` in a run's header. `null` means "never reviewed"; a reviewed PR with no findings gets an all-zero object. The client's hover preview applies the same rule to `/pulls/:id/reviews`, so change both together. Evidence: server/src/modules/pulls/status.ts:49

## Recurring Errors & Fixes

<!-- An error seen more than once, with its fix. -->

## Session Notes

<!-- One dated line per work session. -->

- 2026-11-21 — Added CLAUDE.md, INSIGHTS.md, docs/ and specs/ for the package; no source code changed.

- 2026-11-21 — Built M1 run cost badge (server): `agent_runs.cost_usd` (migration 0010), cost in RunSummary/RunStats/PrMeta, idempotent seeded run for PR #482; spec server/specs/M1-cost-badge.md.

- 2026-11-22 — Imported the upstream repo `ai-agentic-engineering-neo/dev-digest` into the local app through the API (repo, clone, index, 50 PRs) and added its open PR #14 as a hand-written row; no source code changed.

- 2026-11-22 — Changed the PR list cost from the latest run to the total of all runs: `PrMeta.last_run_cost_usd` renamed to `total_cost_usd` in both contract copies, `pulls/routes.ts`, specs and tests updated.

- 2026-11-23 — Built the M1 findings column (server): `PrMeta.findings_counts` on `GET /repos/:id/pulls`, `pickLatestReviewPerAgent`, and a second seeded run and review on PR #482 (Performance Reviewer); spec server/specs/M1-findings-column.md. Merged `LEARNINGS.md` into this file.

## Open Questions

<!-- What is still unresolved. -->

- 2026-11-21 — `TESTING.md` says `server/package.json` is `skip-worktree`, but `git ls-files -v` shows no skip-worktree file in this clone. Until confirmed, run the test split with `pnpm exec vitest run …` as CI does and do not add `test:unit` / `test:integration` scripts. Evidence: TESTING.md:83
