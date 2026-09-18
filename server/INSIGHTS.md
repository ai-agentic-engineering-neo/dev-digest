# server — insights

Durable findings recorded by the `engineering-insights` skill: things that are
true about this code but not visible in it. Append-only — correct a stale entry
with a dated note beneath it rather than editing it away.

Sections are fixed. Add to the one that fits; never invent a new heading.

## What Works

- **2026-08-05** — Field ORDER in a `completeStructured` zod schema is generation order, and moving the classification/score fields to LAST is what makes them informative: with `category` and `confidence` declared before `rule`, a live conventions scan of `angular-osf` labelled all 12 candidates `imports` and scored every one exactly 0.90; with them after `rule` + evidence (plus an `occurrences` count the model must fill in first), the same model on the same repo returned 5 distinct categories and confidences spanning 0.50-0.95. Evidence: `src/modules/conventions/prompt.ts` (`ExtractionSchema` field order + the note on it).

## What Doesn't Work

- **2026-07-29** — A green `pnpm test` does not mean the integration tests ran: `*.it.test.ts` files self-skip when no Docker daemon is reachable, so a machine without Docker reports success having exercised none of the DB paths. Evidence: `server/test/helpers/pg.ts:10`.

- **2026-07-29** — `TESTING.md:43` promises a Windows `typecheck` job as the `@ast-grep/napi` prebuilt gate; the gate no longer exists, so a missing win32 prebuilt now reaches users uncaught. Evidence: commit `b7838c8` *"ci(server): drop the Windows typecheck matrix"*.

- **2026-07-29** — `TESTING.md:83` explains the test-lane invocation by claiming `server/package.json` is `skip-worktree`; it is not, in a fresh clone, so anyone reasoning from that premise is reasoning from a local artifact. Evidence: `git ls-files -v | grep -v '^H'` returns nothing. The consequence it describes still holds — CI calls `pnpm exec vitest run …` because no `test:unit` / `test:integration` scripts are committed.

- **2026-08-05** — Not one route declares `schema.response`, so the zod serializer compiler wired at `app.ts:65` has nothing to compile: the response allowlist that would stop a handler leaking extra fields is inactive, and the `isResponseSerializationError` branch at `app.ts:130-134` is unreachable. Evidence: `grep -rn "response:" src/modules/` returns nothing across 37 routes in 8 modules.

- **2026-08-05** — Nothing in the server runs inside a DB transaction, so multi-write sequences are non-atomic by construction — a crash mid-`insertReview`→`insertFindings`→`markReviewed` leaves a findings-less review on a PR already marked reviewed, and the `delete`+`insert` of `pr_files`/`pr_commits` inside the PR-detail GET can destroy the persisted diff the offline path falls back to. Evidence: `grep -rn "\.transaction(" src/` returns nothing; `src/modules/reviews/run-executor.ts:218-234`, `src/modules/pulls/routes.ts:240-263,279`.

- **2026-08-05** — `src/db/schema/reviews.ts` and `src/db/schema/runs.ts` declare zero indexes, so the queries the PR list and the 4s active-runs poll actually run (`inArray(findings.reviewId, …)`, `reviews` by `pr_id`, `agent_runs` by `pr_id`+`ran_at`) have no index behind them — Postgres does not index foreign keys automatically. Evidence: `src/modules/pulls/routes.ts:131-133,158,176-180`.
  - **2026-08-05** — Resolved: the three indexes exist, but note the trap that nearly shipped them dead — adding `index()` to a Drizzle schema changes NOTHING until `pnpm db:generate` writes a migration, and this repo does not apply migrations on boot, so the TypeScript and the database disagreed silently. Evidence: `src/db/migrations/0012_silky_diamondback.sql` (was `0011_…` before the journal repair renumbered 0011–0015 to 0012–0016).
    - **2026-08-05** — The second half of that trap bites even after the migration file exists: generating it does not apply it, and `pnpm typecheck` / `pnpm test` all pass because the integration lane runs migrations on a fresh testcontainer. The developer's own DB only fails at request time, as a raw Postgres `column <table>.<col> does not exist`. A schema change is three steps — edit, `pnpm db:generate`, `pnpm db:migrate` — and the third is the one nothing reminds you about. Evidence: adding `agent_skills.enabled` (migration `0014_old_rawhide_kid.sql`, was `0013_…`).

- **2026-08-05** — An agent's `agent_versions` snapshot is not reproducible with respect to its skills: `snapshotVersion` reads the current links into `config_json.skills`, but `setSkills` / `linkSkill` / `unlinkSkill` never snapshot and `isConfigChange` has no skill field, so relinking skills changes what version N's prompt would assemble to while version N stays version N. Evidence: `src/modules/agents/repository.ts:148-166` vs `:208-235`; `src/modules/agents/helpers.ts:61-85`.

- **2026-08-05** — `pnpm db:generate` run on a machine whose migration journal diverged from upstream main silently REWRITES committed `_journal.json` history instead of appending: commit `641b637` replaced entry 10's tag with `0010_polite_sasquatch` (a file that exists on no branch) and dropped `0011_nasty_pretty_boy`, so every fresh-DB lane crashed with `No file …0010_polite_sasquatch.sql found` while every already-migrated DB kept passing, and the regenerated snapshots lost the `critical_count`/`warning_count`/`suggestion_count` columns that `src/db/schema/runs.ts:39` still declares. Evidence: `git diff ae55e4b 641b637 -- server/src/db/migrations/meta/_journal.json`.
  - The repair, for next time: restore upstream's journal entries and `meta/0011_snapshot.json`, renumber the branch's migrations/snapshots after them (here 0011–0015 → 0012–0016), re-add the lost columns to the renumbered snapshots, relink the first renumbered snapshot's `prevId`, and hand-apply the lost columns to any DB that migrated from the broken journal — drizzle's migrator compares only `when` timestamps, so a restored older entry never auto-applies to an existing DB.

- **2026-08-18** — `test/reviews.it.test.ts`'s "runs a review: map-reduce +
  grounding drops the hallucinated finding, keeps the valid one" fails on a
  clean `feat/HW4-smart-diff` checkout, reproducibly, against real
  Testcontainers Postgres: `expect(listed.findings_counts).toEqual(...)`
  gets `undefined` instead of the expected counts object. Confirmed
  pre-existing (not caused by unrelated work) via `git stash` + rerun on
  unmodified `HEAD`. Not yet root-caused — before spending time on unrelated
  work in this area, check whether it's still broken; don't assume a local
  regression you didn't cause. `server/test/reviews.it.test.ts:215`

- **2026-08-05** — An import of a package absent from both `package.json` and `pnpm-lock.yaml` passes typecheck, unit, and integration lanes locally because a stray copy sits in `server/node_modules` (`fflate`, imported at `src/modules/skills/service.ts:1`), and only a fresh `pnpm install --frozen-lockfile` exposes it as TS2307 — verify a new import against a clean worktree install, not the dev tree. Evidence: `grep fflate package.json pnpm-lock.yaml` returned nothing while `pnpm typecheck` was green.

- **2026-09-16** — `repo-intel`'s `getBlastRadius` had two gaps its own
  naming/comments already pointed at, both silent (no test caught them): (1)
  `MAX_CALLERS_PER_SYMBOL` (`constants.ts:30`) was applied as a single global
  `callers.slice(0, 20)` across every changed symbol combined, not per symbol
  as its name says — a PR touching 2+ symbols could starve one symbol's
  callers entirely; (2) `getResolvedCallers` didn't exclude
  `fromPath === declFile`, unlike the ripgrep-degraded path which already did
  (`service.ts:273` pre-fix) — a same-file self-reference could resolve
  through a `file_edges` self-edge and leak back as a "caller" of its own
  declaration. **Fixed 2026-09-16**: capped per `viaSymbol` group in
  `tryPersistentBlast` (`service.ts`), added `ne(fromPath, declFile)` to
  `getResolvedCallers`'s where clause (`repository.ts`). Covered by
  `server/test/repo-intel-blast-persistent.test.ts` (cap, hermetic) and
  `server/test/blast.it.test.ts` (self-ref exclusion, needs real Postgres —
  the SQL predicate can't be exercised with a stubbed repository).

## Codebase Patterns

- **2026-09-16** — repo-intel's internal `BlastResult` (flat `callers[]` with
  a `viaSymbol` field, plus a `factsByFile` keyed by file) and the shared
  wire contract `BlastRadius` (one `DownstreamImpact` per changed symbol,
  each with its own `endpoints_affected`) are different shapes on purpose —
  a feature module built on `getBlastRadius()` needs an explicit mapping
  step, not a passthrough. Per-symbol endpoint/cron attribution also needs
  the reverse-import BFS kept per changed FILE
  (`BlastResult.dependentFilesByChangedFile`), not merged into one global
  set up front — a merged set can't tell which changed symbol's declaring
  file is the one that actually reaches a given downstream route.
  `server/src/modules/blast/helpers.ts` (`toBlastRadius`),
  `server/src/modules/repo-intel/types.ts` (`BlastResult`).

- **2026-08-15** — `ReviewRepository`'s raw query layer and its DTO layer
  disagree on casing for the same finding fields: `repo.reviewsForPull()`
  returns `FindingRow[]` straight off Drizzle, with `startLine`/`endLine`
  (camelCase, matching the DB column names); `reviewToDto()` in `helpers.ts`
  is what maps those to the wire contract's `start_line`/`end_line`
  (snake_case). A new consumer that calls `repo.reviewsForPull()` directly
  (bypassing `service.reviewsForPull()`/`reviewToDto`) — e.g. to build a
  second, unrelated view over the same findings — must read `.startLine`,
  not `.start_line`, or it silently gets `undefined` with no type error
  (Drizzle's inferred row type has no `start_line` field to typo into
  safely). Evidence: `src/modules/reviews/repository/review.repo.ts:41`
  (`startLine: f.start_line` on insert) vs `src/modules/reviews/helpers.ts:52`
  (`start_line: row.startLine` on the DTO mapper).

- **2026-08-13** — A repository class with a `private db: Db` constructor
  param (e.g. `ReviewRepository`) is nominally typed by that private field —
  TypeScript will not accept a duck-typed stub object in its place via plain
  structural assignment, only a real instance backed by a real `Db`.
  **Corrected 2026-08-18:** this does NOT block a hermetic unit test — a
  plain stub cast with `as unknown as ReviewRepository` (or the equivalent
  `Container`) sails through `tsc` (assertions bypass structural checking)
  and behaves correctly at runtime, since JS method/property access doesn't
  see TS's private-field branding at all. `ReviewRunExecutor` (constructor
  takes `container: Container, repo: ReviewRepository, agents:
  Container['agentsRepo']`) now has exactly this: a hand-built `Container`
  covering only `runBus` (real `RunBus` from `platform/sse.ts` — genuinely
  DB-free), `git` (`MockGitClient`), `llm` (`MockLLMProvider`), `agentsRepo`
  (`{enabledSkillsForPrompt, linkedSkills}` stubs), `tokenizer` (`{count}`
  stub), plus a `ReviewRepository` stub covering `getIntent`/`insertReview`/
  `insertFindings`/`markReviewed`/`completeAgentRun`/`saveRunTrace`. Setting
  every queued agent's `repoIntel: false` skips the repo-intel-gated digest
  builders so the fake `Container` doesn't need a `repoIntel` facade either.
  Confirmed the test actually exercises the code (not just typechecks) by
  reverting the fix it guards and watching it fail. `.it.test.ts` is still
  right when the DB itself is what's under test (real SQL/migrations); it is
  not a requirement just because a constructor parameter happens to be
  nominally typed. `server/test/run-executor.test.ts`

- **2026-07-29** — Twelve tables in `src/db/schema/` have zero references outside their own schema file and are meant to stay empty until a course lesson fills them, so an unused table is not dead code. Evidence: `server/README.md:9-14`.

  `ci_installations` · `ci_runs` · `code_chunks` · `composed_reviews` ·
  `conformance_checks` · `digests` · `eval_cases` · `eval_runs` ·
  `installed_plugins` · `multi_agent_runs` · `pr_brief` · `skill_versions`

- **2026-07-29** — `modules/reviews/repository.ts` and `modules/reviews/repository/` are one design, not a duplicate: the file is the facade (the only DB layer for the review domain), the directory holds query implementations split by aggregate. Evidence: `src/modules/reviews/repository.ts:11`. Add queries in the directory; keep the facade as the entry point.

- **2026-07-29** — `platform/prompt.ts` and `platform/prompts.ts` differ by one character and do unrelated jobs: the first is a re-export shim over `reviewer-core` for per-request data, the second a template loader for `src/prompts/*.md` with `{{var}}` interpolation. Evidence: `src/platform/prompts.ts:1-12`.

- **2026-07-29** — Three files in `src/platform/` are pure re-exports of `@devdigest/reviewer-core` and must not be edited to change behaviour: `prompt.ts`, `grounding.ts`, `structured.ts`. Evidence: `src/platform/grounding.ts:1-6`.

- **2026-08-05** — `modules/pulls/` queries the DB straight from `routes.ts` rather than through a `service.ts` + `repository.ts` split like `agents` / `repos` / `reviews` / `repo-intel` — a known outlier, not yet fixed on this branch. `upstream/main` has since split it into `repository`+`helpers`+`service` behind a `dependency-cruiser` `transport-never-queries` rule; that refactor (and the matching `settings`/`workspace` cleanup, plus the `.dependency-cruiser.cjs`/`eslint.config.mjs` enforcement) was deliberately **not** pulled into this branch during the 2026-08-14 upstream merge — see the merge note under Decisions in the root `INSIGHTS.md`. Adopting it later means re-splitting `pulls/routes.ts` ourselves, not just merging upstream's files in, since this branch's own pulls additions (PR intent, etc.) sit on top of the pre-split shape. Evidence: `src/modules/pulls/routes.ts`.

- **2026-08-05** — `rollupSeverities` in `src/modules/pulls/status.ts:23` is dead in production and only its test keeps it alive: it returns lowercase `{critical, warning, suggestion}` while the wire contract's `findings_counts` is uppercase `{CRITICAL, WARNING, SUGGESTION}`, so the PR-list rollup could never use it and counts them separately. Evidence: `grep -rn rollupSeverities src/ test/` → one definition, one test import; `src/vendor/shared/contracts/platform.ts:178-183`.

- **2026-08-05** — `src/adapters/` is not a pure IO ring: it also holds pure functions that services legitimately import, so an import-path rule of the form "services must not import `adapters/*`" would flag correct code — classify by whether the code leaves the process, not by folder. Evidence: `src/adapters/git/diff-parser.ts:14` (`parseUnifiedDiff`, imported by `src/modules/reviews/diff-loader.ts:3`), `src/adapters/codeindex/extract.ts:182` (`extractEndpoints`, imported by `src/modules/repo-intel/service.ts:22`).

## Tool & Library Notes

- **2026-08-15** — The seeded `acme/payments-api` PR #482's `files_count`
  metadata (9) does not match how many `pr_files` rows are actually
  persisted for it (4) — the seed only inserted a handful of files, not the
  full set the PR "claims" to have. Any feature that renders per-file diff
  data against this fixture (Smart Diff, file-list UIs) will only ever see
  those 4 files, not 9, even though the PR header shows "9 files". For a
  realistic large-PR fixture with real patch content instead, use
  `ai-agentic-engineering-neo/dev-digest` PR #136 (`feat/l05 why risk
  brief`) — 479 real files with real unified-diff patches, actually
  imported from GitHub. Evidence: `GET /pulls/0a0293ab-.../smart-diff`
  returns 4 files total across all three role groups vs the PR's own
  `files_count: 9`.

- **2026-08-13** — `ContainerOverrides.llm` is a `Record` keyed by provider id
  (`'openai' | 'anthropic' | 'openrouter'`); `container.llm(id)` looks up
  `overrides.llm?.[id]` by that key, not by the injected instance's own
  `.id` field. So a `MockLLMProvider` — whose constructor type only accepts
  `'openai' | 'anthropic'` — can still be registered to answer for
  `'openrouter'` calls: `overrides: { llm: { openrouter: new
  MockLLMProvider('openai', { structuredBySchema: {...} }) } }`. Needed for
  any feature whose `resolveFeatureModel` default routes through
  `openrouter` (e.g. `review_intent`). `src/platform/container.ts:170`

- **2026-08-05** — Drizzle's `text('col', { enum: [...] })` narrows the TypeScript type only and emits no DB constraint, so `reviews.kind` and every status column are unconstrained free text in Postgres — the boot-time run reaper matching `status='running'` is protected by nothing but convention. Evidence: `src/db/schema/reviews.ts:19`, `src/db/schema/runs.ts:27`, `src/app.ts:81`; the repo has zero `check(` declarations.

- **2026-08-05** — `@fastify/autoload` is a declared dependency that no source file imports, so the dependency list implies a filesystem-autoloaded route tree that does not exist — registration is static in `src/modules/index.ts` on purpose. Evidence: `grep -rn "autoload" src/` returns only the comment at `src/modules/index.ts:17`.

- **2026-08-05** — A schema edit that DROPS one column while ADDING others makes `pnpm db:generate` block on an interactive rename prompt ("Is `category` column in `conventions` created or renamed from another column?"), and that prompt reads the tty directly — `yes '' | pnpm db:generate` and `printf '\r' | script -qec …` both hang until killed. What works is a pty plus a delay before each keystroke: `(for i in 1 2 3 4 5 6 7 8; do sleep 2; printf '\r'; done) | script -qec "pnpm db:generate" /dev/null` (default answer = create column).

- **2026-07-29** — `pnpm db:migrate` dumps raw Postgres NOTICE objects (`'extension "vector" already exists, skipping'`, code 42710) that read like errors but are idempotent skips — the run is fine iff it ends with `✓ migrations applied`. Evidence: `src/db/migrate.ts` sets no `onnotice` handler, so the `postgres` client logs every notice to stderr.

## Recurring Errors & Fixes

- **2026-08-22** — A non-uuid string as `agentId` in `POST /pulls/:id/review`
  does **not** produce `ReviewService.resolveTargets`' clean 404
  `not_found` — it fails earlier at the Drizzle query (`agents.getById`)
  with a raw Postgres `invalid input syntax for type uuid`, surfaced as a
  generic 500 `internal_error`. Only a syntactically-valid-but-nonexistent
  uuid reaches the `NotFoundError` path. A caller that wants to rewrite
  "not found" into an actionable message (e.g. "call list_agents") must
  validate the id looks like a uuid itself first — catching only `code ===
  'not_found'` silently misses the malformed-id case.
  `server/src/modules/reviews/service.ts:50-61`

- **2026-08-13** — `pnpm db:migrate` failing with `relation "X" already exists`
  on a local dev DB (not a fresh one) means the migration-tracking table is out
  of sync with `src/db/migrations/*.sql`, most likely because a merge
  regenerated/renumbered migration files whose DDL your DB already had applied
  under a different file. Drizzle's postgres-js migrator does **not** compare
  per-file hashes to decide what's pending — it only compares each migration's
  journal timestamp (`meta/_journal.json`'s `when`) against the single latest
  `created_at` in `drizzle.__drizzle_migrations`, and reruns anything newer
  (`node_modules/drizzle-orm/pg-core/dialect.js`, `migrate()`). If a later
  migration's `when` is newer than your last-applied `created_at` but its DDL
  is already live (verify with `\d <table>` per object in the file), don't hand
  edit the `.sql` — insert a row into `drizzle.__drizzle_migrations` with that
  migration's sha256 file hash and its `when` as `created_at`, so the tracker's
  "latest applied" moves past it and only genuinely-new migrations run.
- **2026-07-XX** — Newer Anthropic models (e.g. Opus 5) reject requests with a
  `temperature` param at all — a `400`, not a clamped/ignored value — even the
  harmless `0` / `0.2` defaults we used to always send. Only include
  `temperature` in the request when the caller explicitly passed one
  (`req.temperature !== undefined`); omit-by-default, don't default-to-a-number.
  `server/src/adapters/llm/anthropic.ts`

## Session Notes

- **2026-07-29** — Entries above were split out of the root `INSIGHTS.md` when per-module files were introduced; they came from a repo-wide sweep done while writing the `CLAUDE.md` files.

## Open Questions
