# Insights — server

Learnings for `@devdigest/api`: routes, modules, adapters, the DI container,
Drizzle/Postgres, and the review run pipeline.

**Fixed sections — append to the matching one, never to the bottom of the file.**
If an entry fits nowhere here, it probably belongs in `docs/` or nowhere at all.

How to write one: 1–3 lines, newest first inside its section, recording what a
careful reader could not have predicted from the code. Not a task log, not a
changelog, not a restatement of the diff. When an entry has bitten a third time,
promote it to `CLAUDE.md` — § Conventions for a pattern, § Gotchas for a trap —
and leave it here as history.

## What Works

Approaches and solutions that held up, with the context that made them work.

_None yet._

## What Doesn't Work

Dead ends and anti-patterns: what was tried, why it failed, what to do instead.
**The highest-value section and the one most often left empty. Fill it.**

- **The hermetic lane is not hermetic: `test/routes-smoke.test.ts` boots the app against your REAL dev database, and boot writes to it.** (2026-09-23) It calls `buildApp({ config })` without a `db`, so `src/app.ts` opens `DATABASE_URL` from `server/.env` and awaits `ReviewService.reapStaleRuns()` before serving — which marks every `agent_runs` row in `running` as failed. Run the unit suite while a review is in flight and that review dies; nothing in the test output says so.
  → Run the unit lane as `DATABASE_URL=postgres://isolated:isolated@127.0.0.1:1/isolated pnpm exec vitest run --exclude '**/*.it.test.ts'` — the reaper failure is non-fatal and `/health` needs no DB, so all 197 still pass. The `.it` lane is safe: every file passes its own testcontainers `db`. The durable fix (give the smoke test an unreachable `databaseUrl`, or skip the reaper under `NODE_ENV=test`) is still open.

## Codebase Patterns

Conventions and architectural decisions found while working here, before they are
settled enough to move into `CLAUDE.md`.

- **A derived count belongs on the DTO, filled by one grouped IN-query — and it has to be filled on EVERY read path, not just the list.** (2026-09-22) `Skill.agent_count` and `Agent.skill_count` are the same join read from opposite ends (`agentCounts` / `skillCounts`); the trap is `update()`, which returns a DTO too — leaving it at the `toDto(row)` default made a freshly-saved agent report 0 skills until the next list refetch, with nothing in the types to notice.
  → When adding a derived field, grep the module for every `to<Thing>Dto(` call site before declaring it done: create legitimately defaults to 0, but get/list/update must all resolve it. `z.number().int().nonnegative().default(0)` over `.nullish()` keeps the inferred type a plain number so no reader needs `?? 0`.

- **Findings are never deduplicated between runs, so "all reviews of a PR" over-counts.** (2026-09-19) `src/modules/reviews/repository/review.repo.ts:36` inserts a fresh `findings` row per run and the table has no unique key (`src/db/schema/reviews.ts:27`), so an agent re-run on an unchanged PR stores the same problem again — three passes of one security agent read as "3 CRITICAL".
  → For the current state of a PR, take the NEWEST review per (pr_id, agent_id) and only its findings (`src/modules/pulls/routes.ts:131`): an agent supersedes itself, never its colleagues.

- **One review row per AGENT RUN, so "the latest review" of a PR is a lottery.** (2026-09-17) `src/modules/reviews/run-executor.ts:219` inserts a review per run, and a "Run all agents" batch finishes in whatever order the models answer — the local DB holds 3 review rows for a single PR with scores 100, 88 and 65. Anything PR-level that reads the newest row therefore shows a random agent's opinion.
  → For a PR-level number, derive it from the PR's findings instead (`src/modules/pulls/routes.ts:177` scores the list rows through the engine's `scoreFromFindings`), or aggregate every row explicitly — never `ORDER BY created_at DESC LIMIT 1`.

- **`findings.severity` is a free-text column, not a pg enum.** (2026-09-17) `src/db/schema/reviews.ts:36` declares `text('severity').notNull()`, so Postgres accepts any string and the Zod `Severity` enum is the only guard; a row written by an older agent or by hand can carry a value the UI has no colour for.
  → Code that groups or ranks severities must handle an unknown value explicitly (`src/modules/pulls/findings-summary.ts:31` sorts it last), never index a severity table without a fallback.

- **A studio review is ONE LLM call, whatever the test name says.** `REVIEW_STRATEGY` in `src/modules/reviews/constants.ts` is `'single-pass'`, so the whole diff goes in a single call; the integration test titled "runs a review: map-reduce …" in `test/reviews.it.test.ts` exercises single-pass, and `MockLLMProvider` bills 100/50 tokens and `costUsd` 0.001 per call.
  → Size token/cost expectations from the strategy, never from the file count in the fixture diff, and do not read a test's title as the mode it runs.

## Tool & Library Notes

Quirks of dependencies, versions and tooling — what a library does that its docs
do not say.

- **`drizzle-kit generate` becomes INTERACTIVE the moment one migration both drops and adds columns — and no form of piped input answers it.** (2026-09-22) Dropping `conventions.accepted` while adding eight columns made it ask "Is category column in conventions table created or renamed from another column?" once per new column; `printf '\\n\\n\\n' | pnpm exec drizzle-kit generate` returned instantly having written nothing (it reads the TTY, not stdin), and `script -qec "pnpm exec drizzle-kit generate" /dev/null` with the same input hung past a 120s timeout.
  → Write the migration by hand, then build `meta/<NNNN>_snapshot.json` from the previous snapshot: patch only the changed tables, set `prevId` to the old `id` and a fresh uuid as `id`, and append the `_journal.json` entry (`{idx, version: "7", when, tag, breakpoints: true}`). Verify by running `drizzle-kit generate` again — `No schema changes, nothing to migrate` means the snapshot matches the schema; anything else means it does not. A partial unique index carries `"where": "<sql>"` inside its index object.

- **`pnpm typecheck` does not look at `test/**` — the tsconfig `include` is `src/**/*.ts` only.** (2026-09-21) A type error in a new test file is therefore invisible until vitest runs it, and vitest strips types rather than checking them, so it can stay invisible for good. Running tsc over a test-inclusive config shows the backlog this hides: `test/adapters.test.ts:37`, `test/agents-versions.it.test.ts:168`, seven spots in `test/prompt-callers.test.ts`, `test/repo-intel-facade-degraded.test.ts:112` are all red today on `main`-equivalent code.
  → To check a NEW test statically, drop a throwaway config in `server/` that extends `tsconfig.json` with `"include": ["src/**/*.ts", "test/**/*.ts"]`, run `pnpm exec tsc --noEmit -p` it, and grep the output for your own files — the pre-existing errors make an unfiltered run unreadable. Delete the config afterwards.

## Recurring Errors & Fixes

Error or symptom → cause → fix, one entry each, so the next occurrence is a lookup
instead of an investigation.

- **A new table gets a column called `created_at` when you meant `started_at`: `now()` hardcodes the NAME, not just the type.** (2026-09-22) `src/db/schema/_shared.ts:9` is `timestamp('created_at', …)`, so `startedAt: now()` in `convention_scans` compiled, typechecked and read correctly in every query — the only symptom was `drizzle-kit generate` asking "Is created_at column in convention_scans table created or renamed from started_at?".
  → Use `now()` only for a column that is genuinely `created_at`; write any other timestamp out as `timestamp('<name>', { withTimezone: true }).defaultNow().notNull()`. The migration diff is the only place this disagreement surfaces, so read the generated SQL for column NAMES before trusting a new table.

## Session Notes

Dated summaries as `### YYYY-MM-DD — topic`: what was worked on and what state it
was left in. Prune an entry once its content has moved into a section above.

_None yet._

## Open Questions

Unresolved behaviour, undecided design, unverified assumptions. Delete an entry when
it is answered — the answer belongs in another section.

_None yet._
