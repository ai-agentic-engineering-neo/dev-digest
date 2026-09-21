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

- 2026-09-21: `run-executor.ts` marks a run terminal (`completeAgentRun`) BEFORE
  it writes the `run_traces` document (`saveRunTrace`). Anything that polls
  `agent_runs` for a terminal status and then fetches `/runs/:id/trace` can land
  in that gap and get a 404 — it is a real window, not a theoretical one (it hit
  a test whose run finished in ~290ms). Poll for the trace itself rather than
  treating "status is done" as "trace exists".

- 2026-09-21: A DERIVED DTO field (one computed by a join rather than stored on
  the row — e.g. `Skill.agent_count`) has to be populated by every write path,
  not just `list`/`get`. The client writes a mutation's response straight into
  its cache (`useUpdateSkill` → `qc.setQueryData(["skill", id], data)`), so a
  `PUT` that returns the field as `null` visibly BLANKS a value the list had
  already shown. `create` can fill it from a known invariant (a brand-new skill
  has no links, so `0`); `update` has to re-run the aggregate. Covered by an
  assertion in `skills.it.test.ts` — mirror it for any future derived field.

## Tool & Library Notes

- 2026-09-21: `dockerAvailable()` in `test/helpers/pg.ts` probes with
  `execSync('docker info', { timeout: 5000 })`. On Windows under load that probe
  exceeds 5s even when Docker is healthy, and the `*.it.test.ts` suites then
  **skip silently and report green**. A passing integration run is only
  meaningful if the output shows the test count — check for `skipped` before
  believing it, and just re-run.

## Decisions

- 2026-09-20: Per-PR/per-run aggregates that can be "not yet computed" always
  use `null`, never a zero-valued placeholder — a zero-valued object/number
  means "computed, genuinely empty/free/clean" (e.g. a reviewed PR with no
  findings), while `null` means "no review/run produced this data at all".
  Established for `cost_usd`/`score`/`blockers`; the same convention was
  extended to the new `findings_by_severity` (`RunSummary`) and `findings`
  (`PrMeta`) fields — mirror it for any future aggregate on these rows.

- 2026-09-21: A skill body whose `source` is anything but `'manual'` is
  delimiter-wrapped with `wrapUntrusted()` before it enters the prompt
  (`reviews/helpers.ts` → `renderSkillBlocks`). Importing someone's skill is not
  endorsing every sentence in it: without the wrapper, "import a skill from a
  URL" would be a remote prompt-injection channel into every review that agent
  runs. Keep any future skill source that isn't hand-written on the wrapped side.
- 2026-09-21: `SkillSource` / other `text('col', { enum: [...] })` columns have
  NO check constraint in Postgres — drizzle enforces them at the type level only.
  Widening such an enum is a TypeScript-only change; `drizzle-kit generate`
  correctly reports "nothing to migrate". Don't hand-write a migration for it.

## Recurring Errors & Fixes

- 2026-09-20: `pnpm exec vitest run --exclude '**/*.it.test.ts'` on Windows
  fails 6 tests in `test/indexer-pipeline.test.ts` with `ENOENT` opening files
  under a `repo-intel-*` temp dir — pre-existing on this machine, unrelated to
  repo-intel logic itself (a Windows temp-path/write-ordering issue in the
  test's `writeFileAt` helper). Confirm via `git status`/`git diff` that you
  haven't touched `repo-intel`/indexer files before treating this as your
  change's fault.

## Session Notes

- 2026-09-21: `server/src/vendor/shared` and `client/src/vendor/shared` are
  documented as hand-maintained duplicates — but they have ALREADY diverged, and
  not trivially: the client copy lacks `AgentVersionConfig`, the `openrouter`
  provider, `commitFiles`, `findOpenPr`, `sync`, `diffNameOnly` and the
  `sessionId` field. `diff` the two before assuming a symbol exists on both
  sides, and only mirror what your change needs rather than "syncing" them.
- 2026-09-21: Before building anything in the skills area, check what is already
  scaffolded: the `skills` / `skill_versions` / `agent_skills` tables, the Zod
  contracts, the `assemblePrompt({ skills })` parameter, the trace drawer's
  skills block and the whole `messages/en/skills.json` namespace all pre-existed
  with no code between them. The actual gap was one missing argument —
  `run-executor.ts` never passed `skills` to `reviewPullRequest`, so no skill
  ever reached a prompt. Assume "the table exists" ≠ "the feature is wired".

## Open Questions
