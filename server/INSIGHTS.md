# Insights — server

Non-obvious lessons from working in this package, captured by the `engineering-insights` skill.
Read before a non-trivial change and treat as high-confidence guidance unless told otherwise.
Append-only: add a bullet at the end of a section, never rewrite old ones — a newer entry marks
itself `(supersedes YYYY-MM-DD entry)`. Humans prune periodically.

Entry (every bullet, incl. Session Notes / Open Questions — date AND `path:line` are mandatory):
`- **YYYY-MM-DD** · <what is true> → <what to do> · \`path/from/repo-root.ts:42\``

## What Works

## What Doesn't Work
- **2026-09-16** · `@devdigest/shared` exists as two diverged copies (server + client; `diff` shows trace.ts differs in comments) → never copy a whole contract file across; patch the same field into both copies · `client/src/vendor/shared/contracts/trace.ts:68`

## Codebase Patterns
- **2026-09-16** · Run cost is already computed per LLM call and summed in reviewer-core `ReviewOutcome.costUsd` (OpenRouter `usage.cost` → PriceBook → static pricing → null) but was dropped by `run-executor` → persist via `completeAgentRun({ costUsd })` + `trace.stats.cost_usd`; never add extra model calls to price a run · `server/src/modules/reviews/run-executor.ts:214`
- **2026-09-16** · `run_traces.trace` is untyped jsonb read back with a cast, so old documents lack any newly added `RunStats` field → make new trace fields `.nullish()` in the contract and treat undefined as unknown on the client · `server/src/vendor/shared/contracts/trace.ts:69`
- **2026-09-16** · `seed()` creates PR #482's review/findings/demo run ONLY inside the `if (!pr)` branch, so re-seeding an existing dev DB never adds newly seeded rows → new seed fixtures show up only on a fresh DB (`./scripts/e2e.sh` / CI); to see them locally, drop the DB and reseed · `server/src/db/seed.ts:102`
- **2026-09-17** · One "Run Review" writes a separate `reviews` row per agent, so "the newest review" is just whichever agent finished last (often a 0-finding one) → roll up per-PR findings over the latest review of EACH `agent_id` (`latestReviewIdsPerAgent`), not the single newest row · `server/src/modules/pulls/severity.ts:32`

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes
- **2026-09-16** · Run cost feature (spec `specs/001-run-cost.md`): `agent_runs.cost_usd` (0010), PR list SUM of done runs, seeded #482 run; added 3 entries above · `server/specs/001-run-cost.md:1`
- **2026-09-16** · Wrap-up: added 1 Codebase Patterns entry (seed fixtures only on fresh DB) · `server/src/db/seed.ts:102`
- **2026-09-17** · `PrMeta.severity_counts` (latest review, JS grouping in `modules/pulls/severity.ts`, spec `specs/002-pr-severity-counts.md`); no new entries · `server/specs/002-pr-severity-counts.md:1`
- **2026-09-17** · Fix: PR list `severity_counts` summed per agent (#1551 showed "—"); added 1 entry above · `server/src/modules/pulls/routes.ts:148`
- **2026-09-17** · ESLint 9 flat config (`caughtErrors: none`, migrations/clones ignored) + `lint` in CI typecheck job; one-off normalization of entries to `path:line` format; no new entries · `server/eslint.config.mjs:1`
- **2026-09-20** · Wrote `docs/{README,overview,structure,patterns}.md` (package-root-relative paths) and the pointer lines in `CLAUDE.md`; added 1 Open Question (stale skip-worktree claim) · `server/docs/README.md:1`

## Open Questions
- **2026-09-20** · `TESTING.md:83` and the three server/e2e workflows say `server/package.json` is `skip-worktree`, but `git ls-files -v server/package.json` prints `H` (flag NOT set, the file shows as modified in `git status`) and `server-integration.yml:1` counts 12 `*.it.test.ts` files where there are 6 → decide whether to re-set the flag or update TESTING.md + workflow comments; until then do not rely on "local variant" reasoning when editing `server/package.json` scripts · `TESTING.md:83`
