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

- **2026-08-05** — An import of a package absent from both `package.json` and `pnpm-lock.yaml` passes typecheck, unit, and integration lanes locally because a stray copy sits in `server/node_modules` (`fflate`, imported at `src/modules/skills/service.ts:1`), and only a fresh `pnpm install --frozen-lockfile` exposes it as TS2307 — verify a new import against a clean worktree install, not the dev tree. Evidence: `grep fflate package.json pnpm-lock.yaml` returned nothing while `pnpm typecheck` was green.

## Codebase Patterns

- **2026-07-29** — Twelve tables in `src/db/schema/` have zero references outside their own schema file and are meant to stay empty until a course lesson fills them, so an unused table is not dead code. Evidence: `server/README.md:9-14`.

  `ci_installations` · `ci_runs` · `code_chunks` · `composed_reviews` ·
  `conformance_checks` · `digests` · `eval_cases` · `eval_runs` ·
  `installed_plugins` · `multi_agent_runs` · `pr_brief` · `skill_versions`

- **2026-07-29** — `modules/reviews/repository.ts` and `modules/reviews/repository/` are one design, not a duplicate: the file is the facade (the only DB layer for the review domain), the directory holds query implementations split by aggregate. Evidence: `src/modules/reviews/repository.ts:11`. Add queries in the directory; keep the facade as the entry point.

- **2026-07-29** — `platform/prompt.ts` and `platform/prompts.ts` differ by one character and do unrelated jobs: the first is a re-export shim over `reviewer-core` for per-request data, the second a template loader for `src/prompts/*.md` with `{{var}}` interpolation. Evidence: `src/platform/prompts.ts:1-12`.

- **2026-07-29** — Three files in `src/platform/` are pure re-exports of `@devdigest/reviewer-core` and must not be edited to change behaviour: `prompt.ts`, `grounding.ts`, `structured.ts`. Evidence: `src/platform/grounding.ts:1-6`.

- **2026-08-05** — `modules/pulls/` is the only module that never grew past routes-only, so its 382-line `routes.ts` holds 18 direct `container.db` calls, the GitHub sync, and DTO mapping inline while `agents` / `repos` / `reviews` / `repo-intel` all have `service.ts` + `repository.ts` — treat it as the outlier to fix, not as a second sanctioned shape. Evidence: `src/modules/pulls/routes.ts` (only sibling is `status.ts`).
  - **2026-08-05** — Sharpening: `pulls` is the largest case but not the only one — four of the eight modules query the DB straight from the transport layer. Evidence: `grep -rln "db/schema" src/modules/*/routes.ts` → `polling`, `pulls`, `settings`, `workspace` (each also imports `drizzle-orm` in `routes.ts`).
    - **2026-08-05** — Resolved: all four are clean and both greps now return nothing; `pulls` went to `repository`+`helpers`+`service` (routes.ts 382→52 lines), `settings` to `repository`+`service`, while `polling`/`workspace` stayed routes-only and reach shared tables through the new `container.reposRepo` / `container.pullsRepo`. Evidence: `src/platform/container.ts` (`reposRepo`, `pullsRepo` getters); the rule that keeps it that way is `transport-never-queries` in `.dependency-cruiser.cjs`.

- **2026-08-05** — `rollupSeverities` in `src/modules/pulls/status.ts:23` is dead in production and only its test keeps it alive: it returns lowercase `{critical, warning, suggestion}` while the wire contract's `findings_counts` is uppercase `{CRITICAL, WARNING, SUGGESTION}`, so the PR-list rollup could never use it and counts them separately. Evidence: `grep -rn rollupSeverities src/ test/` → one definition, one test import; `src/vendor/shared/contracts/platform.ts:178-183`.

- **2026-08-05** — `no-cross-module-internals` bans importing another module's `helpers.ts`, and the container only shares *repositories*, so a pure row→DTO mapper that two modules both need has no shared home: it is duplicated on purpose. The agents module maps a skill row itself (`toAgentSkillDetail`) rather than importing the skills module's `toSkillDto`. Only `constants.ts` / `types.ts` are importable across modules. Evidence: `.dependency-cruiser.cjs:29-40`, `src/modules/agents/helpers.ts` (`toAgentSkillDetail`).

- **2026-08-05** — `src/db/rows.ts` is the sanctioned home for a row type two modules both need, and it is load-bearing rather than stylistic: `dependency-cruiser` runs with `tsPreCompilationDeps: false`, so a cross-module `import type { X } from '../other/repository.js'` is erased before the graph is built and the `no-cross-module-internals` rule cannot see it — the convention is the only thing catching that reach. Evidence: `src/db/rows.ts:3-11`.

- **2026-08-05** — `modules/settings/feature-models.ts` is the one cross-module import the arch rules allow into another module's folder — `no-cross-module-internals` bans only `service|repository|routes|helpers|run-executor|diff-loader|findings|status`, so a system LLM feature resolves its model with a direct `import { resolveFeatureModel } from '../settings/feature-models.js'` rather than through the container. Evidence: `.dependency-cruiser.cjs:29-40`, `src/modules/conventions/service.ts:11` (`pnpm arch` clean).

- **2026-08-05** — `src/adapters/mocks.ts` doubles as a spec for unbuilt features: `MockLLMOptions.structuredBySchema` names the schemas of a conventions flow that did not exist (`'ConventionFileSelection'` then `'ConventionExtraction'`), so the intended two-step design — model RANKS a code-built candidate file list, then extracts — is discoverable there before any module is written. Evidence: `src/adapters/mocks.ts:46-52`.

- **2026-08-05** — `src/adapters/` is not a pure IO ring: it also holds pure functions that services legitimately import, so an import-path rule of the form "services must not import `adapters/*`" would flag correct code — classify by whether the code leaves the process, not by folder. Evidence: `src/adapters/git/diff-parser.ts:14` (`parseUnifiedDiff`, imported by `src/modules/reviews/diff-loader.ts:3`), `src/adapters/codeindex/extract.ts:182` (`extractEndpoints`, imported by `src/modules/repo-intel/service.ts:22`).

## Tool & Library Notes

- **2026-08-05** — Drizzle's `text('col', { enum: [...] })` narrows the TypeScript type only and emits no DB constraint, so `reviews.kind` and every status column are unconstrained free text in Postgres — the boot-time run reaper matching `status='running'` is protected by nothing but convention. Evidence: `src/db/schema/reviews.ts:19`, `src/db/schema/runs.ts:27`, `src/app.ts:81`; the repo has zero `check(` declarations.
  - **2026-08-05** — Partly resolved: `check()` (exported from `drizzle-orm/pg-core` since well before the pinned 0.38.4) now guards the seven live review-pipeline columns. Evidence: `src/db/migrations/0013_condemned_stranger.sql` (was `0012_…` before the journal repair renumbered it). Two caveats — `ADD CONSTRAINT … CHECK` VALIDATES existing rows, so the migration fails outright on a DB holding a legacy value, and a CHECK is satisfied when its expression is NULL, so nullable columns need no explicit `OR IS NULL`.

- **2026-08-05** — `pull_requests.status` is the one status column that cannot take a CHECK like the others: the column is documented as GitHub's merge state (open/merged/closed) but its DEFAULT is `'needs_review'`, a review status, so both vocabularies are legitimately present in the same column. Evidence: `src/db/schema/pulls.ts:25` vs `src/modules/pulls/status.ts:41-42`.

- **2026-08-05** — `dependency-cruiser` runs on the RUNTIME graph here (`tsPreCompilationDeps: false`), so an UNUSED import is erased by TypeScript and never reaches the graph — testing a new arch rule by adding an unused `import { eq } from 'drizzle-orm'` reports "no dependency violations" and reads as a working rule that is in fact never exercised. Verify with an import the file actually uses. Evidence: `.dependency-cruiser.cjs:82`.

- **2026-08-05** — `dependency-cruiser` cannot enforce any ban on an npm PACKAGE in this repo because `options.exclude` drops `node_modules` from the graph entirely, so package-level import rules (e.g. "routes must not import `drizzle-orm`") have to live in `eslint.config.mjs` as `no-restricted-imports` — the graph tool covers only local paths like `^src/db/schema`. Evidence: `.dependency-cruiser.cjs:95-97`.

- **2026-08-05** — `@fastify/autoload` is a declared dependency that no source file imports, so the dependency list implies a filesystem-autoloaded route tree that does not exist — registration is static in `src/modules/index.ts` on purpose. Evidence: `grep -rn "autoload" src/` returns only the comment at `src/modules/index.ts:17`.

- **2026-08-05** — `dependency-cruiser` sits in `dependencies`, not `devDependencies`, because it runs **in-process at runtime** as the repo-intel depgraph adapter (`cruise()` builds the file-level import graph) — moving it to devDependencies would break indexing in a production install. Evidence: `package.json:25`, `src/adapters/depgraph/index.ts:17`.

- **2026-08-05** — A schema edit that DROPS one column while ADDING others makes `pnpm db:generate` block on an interactive rename prompt ("Is `category` column in `conventions` created or renamed from another column?"), and that prompt reads the tty directly — `yes '' | pnpm db:generate` and `printf '\r' | script -qec …` both hang until killed. What works is a pty plus a delay before each keystroke: `(for i in 1 2 3 4 5 6 7 8; do sleep 2; printf '\r'; done) | script -qec "pnpm db:generate" /dev/null` (default answer = create column). Evidence: `src/db/migrations/0016_same_gargoyle.sql` (was `0015_…` before the journal repair renumbered it).

- **2026-07-29** — `pnpm db:migrate` dumps raw Postgres NOTICE objects (`'extension "vector" already exists, skipping'`, code 42710) that read like errors but are idempotent skips — the run is fine iff it ends with `✓ migrations applied`. Evidence: `src/db/migrate.ts` sets no `onnotice` handler, so the `postgres` client logs every notice to stderr.

## Recurring Errors & Fixes

## Session Notes

- **2026-07-29** — Entries above were split out of the root `INSIGHTS.md` when per-module files were introduced; they came from a repo-wide sweep done while writing the `CLAUDE.md` files.

## Open Questions
