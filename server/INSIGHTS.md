# INSIGHTS.md — @devdigest/api

Append-only. Read before starting work in this package. Updated by the
`engineering-insights` skill — only when a session learns something
non-obvious; never rewritten, only appended to.

## What Works

## What Doesn't Work

## Codebase Patterns

- 2026-09-20: `agent_runs` (the Timeline/`RunSummary` row) mixes two different
  strategies for per-run aggregates on the SAME row — `score`/`blockers`/
  `cost_usd` are denormalized onto the row at completion time
  (`run-executor.ts` → `completeAgentRun`), while the newer
  `findings_by_severity` is computed at READ time via a join against
  `reviews`/`findings` in `run.repo.ts` (`listRunsForPull`), chosen to avoid a
  schema migration. Don't assume every `RunSummary` field is denormalized —
  check `run.repo.ts` vs `run-executor.ts` before adding a new one.

## Tool & Library Notes

## Decisions

- 2026-09-20: Per-PR/per-run aggregates that can be "not yet computed" always
  use `null`, never a zero-valued placeholder — a zero-valued object/number
  means "computed, genuinely empty/free/clean" (e.g. a reviewed PR with no
  findings), while `null` means "no review/run produced this data at all".
  Established for `cost_usd`/`score`/`blockers`; the same convention was
  extended to the new `findings_by_severity` (`RunSummary`) and `findings`
  (`PrMeta`) fields — mirror it for any future aggregate on these rows.

## Recurring Errors & Fixes

- 2026-09-20: `pnpm exec vitest run --exclude '**/*.it.test.ts'` on Windows
  fails 6 tests in `test/indexer-pipeline.test.ts` with `ENOENT` opening files
  under a `repo-intel-*` temp dir — pre-existing on this machine, unrelated to
  repo-intel logic itself (a Windows temp-path/write-ordering issue in the
  test's `writeFileAt` helper). Confirm via `git status`/`git diff` that you
  haven't touched `repo-intel`/indexer files before treating this as your
  change's fault.

## Session Notes

## Open Questions
