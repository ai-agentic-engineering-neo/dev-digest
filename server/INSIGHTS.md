# Insights — server

Running log of non-obvious things learned while working in `@devdigest/api`:
gotchas, dead ends, decisions that don't belong in the fixed map in
[`CLAUDE.md`](CLAUDE.md). Newest entries at top.

<!-- Add entries below, e.g.:
## 2026-09-15 — short title
What happened, what was tried, what actually worked or didn't, and why.
-->

## 2026-09-20 — `agent_skills` link-order upsert must use `onConflictDoUpdate`, not `onConflictDoNothing` [Bug found via manual smoke test]
`seed.ts`'s agent↔skill link loop originally used `.onConflictDoNothing()`
keyed on the `agent_skills` PK (`agentId`,`skillId`). During development the
skill/order list changed shape more than once, so an earlier seed run had
already inserted `(testQualityAgentId, flakyTestsSkillId)` at `order: 1`;
once the final code moved "Flaky tests" to `order: 3` and added "Missed
corner cases" at `order: 1`, re-running seed left the DB with **one skill
permanently missing from the agent's linked list and a stale order value on
another** — `onConflictDoNothing` means a reseed can never repair a link
that already exists with the wrong `order`, only add brand-new pairs. Found
by manually hitting `GET /agents/:id/skills` after seeding and getting 3
links instead of 4. Fixed by switching both link inserts to
`.onConflictDoUpdate({ target: [agentId, skillId], set: { order } })` —
matches the file's own doc comment ("re-running **upserts** the demo
fixtures"). Verified: reseeding twice now converges to the same 4
correctly-ordered links, and a subsequent `4 skill(s) applied: …` log line
from a real `POST /pulls/:id/review` run confirmed the fix reaches
`PromptAssembly.skills` end-to-end (and dropped to `3 skill(s) applied` when
one was toggled `enabled: false`, as expected). Lesson: any `agent_skills` /
similarly-ordered join-table seed insert in this repo should default to
`onConflictDoUpdate` on the mutable columns, not `onConflictDoNothing` —
the latter is only safe when every column besides the PK is truly immutable
once set.

## 2026-09-20 — `agent_skills` gives two opposite per-row counts from one join; split into two methods [Decision]
The Skills feature spec asked for one `SkillsRepository.agentCounts(workspaceId)`
(`server/src/modules/skills/repository.ts:184-216`) and then, separately, said
to reuse that same method to populate `Agent.skills_count` in
`AgentsService.list()`. Those are opposite reductions of the same join: a
row scoped to `agent_skills` joined to the workspace's `skills` carries both
an `agentId` and a `skillId`, so grouping it by `skillId` gives "agents per
skill" (`Skill.agents_count`) while grouping the SAME rows by `agentId`
gives "skills per agent" (`Agent.skills_count`) — one `Map<string, number>`
return type can't serve both directions at once. Resolved by factoring the
join into a private `agentSkillPairs()` and exposing two thin reducers,
`agentCounts()` (keyed by skillId) and `skillCountsByAgent()` (keyed by
agentId, used from `server/src/modules/agents/service.ts`'s `list()`) —
both still "one query, reduce in JS", per the no-`GROUP BY` convention
below. If a future lesson needs this again, reach for the pair, not a
single generically-named counter.

## 2026-09-20 — fflate's `unzipSync` lists directory entries as `''`-suffixed empty-body keys [Context]
`fflate@0.8` (`server/src/modules/skills/import.ts`) returns directories
from a zip listing as ordinary keys in the same `Record<string, Uint8Array>`
as files — e.g. `'pkg/'` with a zero-length `Uint8Array`, not omitted and
not flagged by any separate boolean. There's no `.dir`/`.isDirectory` field
to check; the only signal is the trailing `/` on the key itself (confirmed
empirically via `zipSync`/`unzipSync` round-trip, not from reading fflate's
d.ts). `importSkillFromFile`'s `isDirEntry()`/`isMarkdownEntry()` helpers
filter on that trailing slash before searching for a `.md` entry AND before
counting "other files" for the import warning — skipping this filter would
both misreport the ignored-file count and could false-positive-match a
directory literally named `something.md/`.

## 2026-09-18 — PR-list cost column sums runs; score/findings deliberately don't [Decision]
`GET /repos/:id/pulls` in `modules/pulls/routes.ts` computes three per-PR
rollups (score, findings, cost) with the same "one IN-query, reduce in JS"
shape — score at `routes.ts:118` (`latestReviewByPr`), findings at
`routes.ts:138` (`findingsByReviewId`), cost at `routes.ts:170` (the
`agentRuns.costUsd` query) — but the reduction differs on purpose: score
and findings use "latest review wins" (a re-review replaces the prior
verdict, so history shouldn't accumulate), while cost sums every
`status='done'` run (each run actually spent money, so history must
accumulate). Don't unify these three into one
helper — they're intentionally different aggregations wearing the same
query pattern. For the cost sum specifically: a `done` run with `costUsd:
null` (provider reported no usage/pricing) contributes 0 and is otherwise
ignored, and the PR's total is `null` only when **no** `done` run has cost
data at all — this stops one undated run from silently zeroing out an
otherwise-known total, while keeping the existing "null means unknown, not
free" convention from `RunCostBadge`. Also confirmed: no SQL `SUM`/`GROUP
BY` exists anywhere in this codebase — every per-PR rollup reduces rows in
JS after a single `IN` query (justified inline as cheap since PR lists are
small) — so the cost fix kept that style rather than introducing the first
SQL aggregate. The `cost_usd` field's doc comment lives as a plain comment
in `vendor/shared/contracts/platform.ts`, hand-mirrored in
`client/src/vendor/shared/contracts/platform.ts` — both copies needed
updating since they're copies, not symlinks.

## 2026-09-16 — fixed: `pnpm db:migrate`/`pnpm db:seed` silently no-op when the checkout path has spaces [Mistake]
Both `src/db/migrate.ts:37` and `src/db/seed.ts:228` guarded their CLI
entrypoint with `import.meta.url === \`file://${process.argv[1]}\``.
`import.meta.url` is percent-encoded (spaces → `%20`); `process.argv[1]` is
not. On a checkout path containing spaces (e.g. this repo under
`.../AI Agentic Engineer/dev-digest/...`), the two never match, so the CLI
branch was skipped in BOTH files — `pnpm db:migrate` / `pnpm db:seed` exited
0 with **zero output and nothing applied/seeded**, no error at all. This is
exactly the trap that produces "No system user found — run `pnpm db:seed`"
even right after having run it (confirmed live: a user hit this after
`./scripts/dev.sh --no-seed` + a separate `pnpm db:seed`). Fixed in both
files by comparing `fileURLToPath(import.meta.url)` to `process.argv[1]`
instead of raw string equality — verified `pnpm db:migrate` and
`pnpm db:seed` now print their success line and actually apply/seed.
Anyone hitting a "ran the command, nothing happened, no error" mystery on a
spacey path should check this pattern in any other `if (import.meta.url ===
...)` CLI entrypoint in this codebase.

## 2026-09-16 — a run's completion writes TWO independent sibling documents [Context]
`modules/reviews/run-executor.ts` persists the same in-memory numbers
(`durationMs`, `tokensIn`, `tokensOut`, now `costUsd`) twice, in two
unrelated calls: `completeAgentRun()` at `run-executor.ts:243` (→ the
`agent_runs` row, source for `RunSummary`/PR-list cost) and the
`RunTrace.stats` object literal at `run-executor.ts:256` a few lines later
(→ the `run_traces` jsonb blob, source for the trace-drawer stat row).
Neither read path derives from the other. Adding any new per-run stat means touching
both call sites in `run-executor.ts` AND both `RunStats`/`RunSummary` shapes
in `vendor/shared/contracts/trace.ts` (server AND client copies) — missing
one silently leaves the stat blank on exactly one of the three UI surfaces
(PR list / timeline vs. the run trace drawer) while the others work fine.

## 2026-09-16 — pnpm 12's build-approval gate blocks headless `pnpm install`/`db:generate` [Decision]
Process/tooling gotcha, not tied to a single source line — the workaround
below runs already-built binaries directly instead of changing any file.
This env's pnpm is v12 (via `corepack`/`npx pnpm`), which added a
mandatory interactive `pnpm approve-builds` gate for any dependency with a
native build script (`esbuild`, `ssh2`, `cpu-features`, `protobufjs`, …).
Non-interactively it always fails with `ERR_PNPM_IGNORED_BUILDS`, even with
`--ignore-scripts` — there's no documented non-interactive bypass flag.
Worked around by skipping `pnpm run <script>` for one-off CLI needs and
invoking the already-installed binary directly instead (e.g.
`node_modules/.bin/drizzle-kit generate`, `node_modules/.bin/vitest run`,
`node_modules/.bin/tsc --noEmit`) — the packages were already resolved into
`node_modules` from an earlier successful install, so the binaries exist
even though the "approve builds" step never completed. Also: running
`pnpm install` in `reviewer-core/` (which is npm-managed, tracked
`package-lock.json`) auto-creates a stray `pnpm-lock.yaml` — remove it and
reinstall with `npm install` instead.
