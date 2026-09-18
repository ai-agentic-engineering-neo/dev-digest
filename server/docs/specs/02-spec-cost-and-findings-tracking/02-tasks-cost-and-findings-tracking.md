# 02-tasks-cost-and-findings-tracking.md

## Repository Standards Discovery

| Source File | Read | Standards Extracted | Conflicts |
|---|---|---|---|
| root `CLAUDE.md` | yes | Monorepo package table; naming conventions (colocated `_components/<Name>/`, Zod schema/type same name, camelCase↔snake_case); Do-not-touch (`vendor/`, migrations, lock files) | none |
| `server/CLAUDE.md` | yes | `src/vendor/shared` is the single source of truth for shared contracts — edit there, mirror into `client/src/vendor/shared` | none |
| `client/CLAUDE.md` | yes | Feature logic lives in colocated `_components/<Name>/`; API calls only via `src/lib/hooks/*` | none |
| `server/INSIGHTS.md`, `client/INSIGHTS.md` | yes | Prior "Cost" feature had been built and reverted twice before this branch; `agent_runs.batch_id` groups one `runReview()` call's runs; `ReviewOutcome.costUsd` was already computed upstream but discarded before this work | resolved — see Decision entries dated 2026-09-14/16 |
| `.github/workflows/server-unit.yml`, `client.yml` | yes | CI runs `pnpm typecheck` then the hermetic vitest suite per package | none |
| lint/format config | not found prior to this branch | — | added in this branch, see Block B |

## Tasks

### [x] 1.0 Run cost computation & persistence

#### 1.0 Proof Artifact(s)
- Test: `server/test/price-book.test.ts` — `PriceBook` cost math from known usage.
- Verified: `run-executor.ts` reads `ReviewOutcome.costUsd` into `completeAgentRun` (previously silently dropped — see `server/INSIGHTS.md` 2026-09-14 Context entry).

#### 1.0 Tasks
- [x] 1.1 Confirm `reviewer-core`'s `ReviewOutcome.costUsd` computation (pre-existing, map-reduce aware).
- [x] 1.2 Wire `costUsd` from `ReviewOutcome` through `run-executor.ts` into `agent_runs.cost_usd`.
- [x] 1.3 Expose `cost_usd`/`tokens_in`/`tokens_out` on `RunSummary`/run-trace API shapes.

### [x] 2.0 PR-list COST column (total spend per PR)

#### 2.0 Proof Artifact(s)
- Test: `server/test/total-cost.test.ts` — single run, multi-run sum across a PR's whole history, failed-runs excluded, all-failed → `null`, PR isolation (6 cases).
- Code: `server/src/modules/pulls/total-cost.ts` (`totalCostByPr`), wired in `server/src/modules/pulls/routes.ts:133-146`.

#### 2.0 Tasks
- [x] 2.1 Add `cost_usd` to shared `PrMeta` contract (`server/src/vendor/shared/contracts/platform.ts`, mirrored to `client/src/vendor/shared`).
- [x] 2.2 Implement `totalCostByPr` — sum of every `status='done'` run's cost per PR, `null` when zero completed runs.
- [x] 2.3 Wire into `GET /repos/:id/pulls` via one `IN (prIds)` query.
- [x] 2.4 (Revision, 2026-09-16) Re-scope from "latest batch only" to "all-time total" per grading rubric — see `server/INSIGHTS.md` Decision entry; old `latest-batch-cost.ts`/test removed, replaced by `total-cost.ts`/`total-cost.test.ts`.

### [x] 3.0 Findings-by-severity — Review-runs panel, Timeline, and PR-list popover

#### 3.0 Proof Artifact(s)
- Test: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.test.tsx` — pill row omits zero-count severities, click-filter/click-clear.
- Test: `client/src/app/repos/[repoId]/pulls/_components/FindingsSummary/FindingsSummary.test.tsx` — dash on empty, hover popover title/content, no action buttons.
- Manual: browser check against seeded PR #482 (see spec's Success Metrics) — screenshots taken during implementation, not committed (`.playwright-mcp/` is gitignored scratch output).

#### 3.0 Tasks
- [x] 3.1 Add `findings: Finding[] | null` to `PrMeta` (list endpoint), populated from the PR's latest review via `server/src/modules/pulls/routes.ts`.
- [x] 3.2 Extract shared severity helpers to `client/src/lib/findings.ts` (`severityCounts`, `FILTERABLE_SEVERITIES`, `lineLabel`); re-export from existing call sites to avoid touching every import.
- [x] 3.3 Fix `FindingsPanel.tsx` to only render pills for severities present (bug: previously always rendered all 3 regardless of count).
- [x] 3.4 Build `FindingsSummary` (PR-list FINDINGS column): compact icons + hover popover, read-only preview cards (no buttons).
- [x] 3.5 Wire `FindingsSummary` into `PRRow.tsx`; add `findings`/i18n column + popover-title keys.
- [x] 3.6 Remove dead `PrRowView` type (unused, mismatched-shape leftover from an earlier attempt).

### [x] 4.0 Cross-cutting verification & documentation

#### 4.0 Proof Artifact(s)
- CLI: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'` — 19 files / 135 tests green.
- CLI: `cd client && pnpm typecheck && pnpm test` — 14 files / 65 tests green.
- Manual: browser verification against the seeded `acme/payments-api` #482 PR (dev stack via `./scripts/dev.sh`) — FINDINGS column + popover, Review-runs pill filter, all confirmed working.
- Docs: this spec + task list; `server/INSIGHTS.md`/`client/INSIGHTS.md` Decision/Pattern/Mistake entries dated 2026-09-16.

#### 4.0 Tasks
- [x] 4.1 Run full hermetic test suites for `server` and `client`.
- [x] 4.2 Manual browser verification of both new UI surfaces (PR-list popover, Review-runs pill fix).
- [x] 4.3 Write this spec + task list documenting the shipped feature.
- [x] 4.4 Append INSIGHTS.md entries (Decision: cost re-scope; Pattern: findings-on-list query, shared severity helper; Mistake: zero-count pill bug).
