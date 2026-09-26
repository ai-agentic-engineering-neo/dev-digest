# server — INSIGHTS

Append-only engineering insights for `server/`. Written by the `engineering-insights`
skill (`.claude/skills/engineering-insights/`), read at the start of any task that
touches this package. Fixed sections; one dated entry per line; never rewrite an
entry, correct it with a new dated one. Rule: if anyone reading the code would
see it, do not write it.

## What Works

- [2026-09-25] Injecting mock adapters through `ContainerOverrides` keeps every non-`.it.test.ts` test hermetic; no key, network, or Docker needed. Evidence: `server/src/platform/container.ts:40`.
- [2026-09-25] To get a FAILED run in an `.it.test.ts` without a network, pass `MockLLMProvider` a `structured` fixture that fails the Review schema (e.g. `{ not: 'a review' }`): the mock throws, the executor persists status=failed with cost null. Evidence: `server/test/reviews.it.test.ts:a failed run persists a null cost`.

## What Doesn't Work

- [2026-09-25] Reading API keys from `process.env` in feature code. They never reach `AppConfig`; the only reader is `LocalSecretsProvider`, which checks `~/.devdigest/secrets.json` first and env second. Evidence: `server/src/platform/config.ts:9`.
- [2026-09-25] Running the server with more than one API instance per database. Boot reaps every `agent_runs` row in `running` state, so a second replica would kill the first one's live runs. Evidence: `server/src/app.ts:81`.
- [2026-09-25] The contract copies server/src/vendor/shared and client/src/vendor/shared already differ on upstream/main in four files (adapters.ts, contracts/eval-ci.ts, contracts/knowledge.ts, contracts/productionize.ts); a drift check that blames the current branch for them is a false positive, so pr-self-review flags drift as critical only in files the branch touched and as a warning otherwise. Evidence: `diff -rq server/src/vendor/shared client/src/vendor/shared at 66727c8`.

## Codebase Patterns

- [2026-09-25] `src/vendor/shared` is the canonical `@devdigest/shared`; `client/src/vendor/shared` is a copy and has drifted in `adapters.ts`, `eval-ci.ts`, `knowledge.ts`, `productionize.ts`, `trace.ts`. Change here, then copy over. Evidence: `server/src/vendor/shared/index.ts`.
- [2026-09-25] Repo-intel sections of the review prompt stay empty until the repo is indexed; an unindexed repo silently reviews diff-only. Gates: `REPO_INTEL_ENABLED` and per-agent `agents.repo_intel`. Evidence: `server/src/modules/reviews/run-executor.ts:168`.
- [2026-09-25] Global rate limit is skipped when `NODE_ENV=test` so integration suites can hammer routes through `inject()`; per-route caps still apply. Evidence: `server/src/app.ts:95`.
- [2026-09-25] `GITHUB_TOKEN` is canonical; `GITHUB_PAT` is read only as a fallback. Evidence: `server/src/adapters/secrets/local.ts:40`.
- [2026-09-25] `server/clones/` is git-ignored runtime data and no test suite collects it. Evidence: `.gitignore:clones/`.
- [2026-09-25] PR-list cost (`PrMeta.cost_usd`) is a read-time rollup: sum of `agent_runs.cost_usd` over done runs with a non-null cost, absent → null so the UI shows «—». Rejected: a denormalized column on `pull_requests`, which would drift on run delete. Run cost itself is stored at completion, never recomputed from current prices. Evidence: `server/src/modules/reviews/repository/run.repo.ts:costRollupForPulls`.
- [2026-09-25] The routes→service→repository trio in docs/architecture.md is the rule, not the current state: pulls, settings, polling and workspace routes query Drizzle directly, settings/feature-models.ts holds container.db, adapters/astgrep imports modules/repo-intel/constants (adapter→module inversion), repos/service imports repo-intel/constants, run-executor imports db/schema. Treat these as legacy to refactor, never as a pattern to copy. Evidence: `server/src/modules/pulls/routes.ts:3`.
- [2026-09-25] Onion boundary check: dependency-cruiser with tsPreCompilationDeps counts `import type` edges, so every service that imports `type Container` forms a type-only cycle with container.ts. Decision: no-circular ignores type-only edges via `viaOnly.dependencyTypesNot: ['type-only']` and the application-no-container rule reports those files instead. Rejected: dropping tsPreCompilationDeps, which would also hide type-only imports of db/rows in services. Evidence: `server/.dependency-cruiser.cjs:no-circular`.
- [2026-09-25] The comment in .github/workflows/server-unit.yml saying server/package.json is skip-worktree is stale: `git ls-files -v server/package.json` shows H (tracked normally), so scripts added to it (lint:arch) are committed and CI can call them. Evidence: `.github/workflows/server-unit.yml:Inlined rather than`.
- [2026-09-25] Changing an agent's linked skill set (membership or order) bumps `agents.version` and snapshots `config.skills` inside one transaction in `AgentsRepository.setSkills`; an identical set is a no-op. Rejected: silent link edits, which left `agent_versions` unable to replay the prompt an eval saw. Evidence: `server/src/modules/agents/repository.ts:setSkills`.
- [2026-09-25] Skill import uploads travel as JSON `{ filename, content_base64 }` to `POST /skills/import/preview` with a per-route `bodyLimit` (app default is 1 MB), and only the one Markdown core entry of a zip is decoded (fflate `unzipSync`); scripts are listed by name only. Rejected: @fastify/multipart, one more plugin for a 5 MB text upload. Evidence: `server/src/modules/skills/import.ts:extractSkillFromUpload`.
- [2026-09-25] Correction to the import entry above: fflate's `unzipSync` filter runs before inflation and receives `originalSize`, so the parser inflates only Markdown entries under MAX_IMPORT_BYTES and lists everything else by name; a filter on names alone still inflated every entry (zip-bomb path found by pr-self-review). Evidence: `server/src/modules/skills/import.ts:unzipSync`.

## Tool & Library Notes

- [2026-09-25] `err instanceof z.ZodError` fails when shared and api load separate zod instances; the error handler also matches by `name === 'ZodError'` plus an `issues` array. Evidence: `server/src/app.ts:141`.
- [2026-09-25] The server type-checks and imports reviewer-core's raw TypeScript through a path alias, so `reviewer-core/node_modules` must exist. Evidence: `server/tsconfig.json:24`.
- [2026-09-25] simple-git dumps the full clone command — INCLUDING the `x-access-token:<PAT>@` URL — into the thrown GitError, so a failed authenticated clone writes the GitHub token to the API log. Treat dev logs as secret-bearing until that URL is masked. Evidence: `server/src/modules/repos/service.ts:withGitHubToken`.
- [2026-09-25] `eslint --fix` in this repo only strips unused `eslint-disable` directives; the remaining warnings were unused imports in tests and `catch (err)` with an unused binding. `src/vendor/**` and `src/db/migrations/**` are ignored on purpose. Evidence: `server/eslint.config.mjs:ignores`.
- [2026-09-25] No import-boundary check exists (no .dependency-cruiser config, no no-restricted-imports in eslint.config.mjs) although dependency-cruiser is already a runtime dependency for adapters/depgraph, so a layered-architecture check needs no new install. Evidence: `server/package.json:dependency-cruiser`.
- [2026-09-25] dependency-cruiser 17: `depcruise --ignore-known src` prints the help and cruises nothing, because commander takes `src` as the optional [file] argument of --ignore-known. Always pass the baseline file explicitly: `--ignore-known .dependency-cruiser-known-violations.json src`. Also `enhancedResolveOptions.extensionAlias` is rejected by the config schema; `.js`→`.ts` ESM imports resolve without it once `tsConfig` is set. Evidence: `server/package.json:lint:arch`.
- [2026-09-25] ESLint no-restricted-imports gitignore-style groups must end in `*` to catch this repo's `.js`-suffixed relative imports: `**/platform/container` misses `../../platform/container.js`, `**/platform/container*` matches it. Evidence: `server/eslint.config.mjs:no-restricted-imports`.
- [2026-09-25] Extending a Drizzle `text('col', { enum })` column (e.g. adding `imported_file` to `skills.source`) is type-only: the column has no CHECK constraint and `pnpm db:generate` reports 'No schema changes', so no migration is needed or possible. Evidence: `server/src/db/schema/skills.ts:source`.

## Recurring Errors & Fixes

- [2026-09-25] `TS2307: Cannot find module 'openai'` during `pnpm typecheck` or unit tests. Fix: `cd reviewer-core && npm ci` first. Evidence: `.github/workflows/server-unit.yml`.
- [2026-09-25] `relation "…" does not exist` on first API call. Migrations never run on boot. Fix: `cd server && pnpm db:migrate`. Evidence: `server/src/db/migrate.ts:runMigrations`.
- [2026-09-25] Boot fails on `LOG_LEVEL=` (empty) because `''` is not an enum member. Fixed by coercing empty to undefined in config. Evidence: `server/src/platform/config.ts:36`.
- [2026-09-25] API dies silently after `POST /repos/:id/refresh` (log ends with a simple-git stack + bare `Node.js v22…`; browser shows connection refused): a failed job's `done` promise rejected with nobody awaiting it. Fixed: `JobRunner.enqueue` attaches its own catch (logs via `setLogger`) and `server.ts` installs an `unhandledRejection` net. `tsx watch` does NOT restart after a crash — touch a file. Evidence: `server/src/platform/jobs.ts:enqueue`.
- [2026-09-25] Run fails with `401 Missing Authentication header` from OpenRouter although a key is stored: the wording is misleading, OpenRouter returns it for any malformed key (here a GitHub token pasted into the OpenRouter field). Check the stored value's prefix (`sk-or-v1-`) and remember `~/.devdigest/secrets.json` shadows `server/.env`; verify with `GET https://openrouter.ai/api/v1/auth/key`. Evidence: `server/src/adapters/secrets/local.ts:get`.
- [2026-09-25] ESLint `Irregular whitespace not allowed (no-irregular-whitespace)` on a regex like `/^\uFEFF/` means the file holds the literal BOM byte; write the escape sequence `\uFEFF` in the source instead. Evidence: `server/src/modules/skills/import.ts:parseMarkdownSkill`.

## Session Notes

- [2026-09-25] Initial capture from a read-through of the starter: DI, module trio, schema, config, tests. No code changed. Evidence: `server/CLAUDE.md`.
- [2026-09-25] L01 run cost: re-added agent_runs.cost_usd (migration 0010), cost on RunStats/RunSummary/PrMeta, list rollup, seeded priced run; all suites green. Client fixtures patched for the required cost_usd field. Evidence: `server/specs/run-cost-badge.md`.
- [2026-09-25] HW1 criteria pass (in progress): PR list route again returns per-severity counts + read-only finding previews (`latest_findings`, capped by `PREVIEW_LIMIT`); JobRunner failure guard; docs/architecture.md + specs/review-flow.md written by a subagent, not yet proofread. Evidence: `server/src/modules/pulls/routes.ts:previewsByReview`.
- [2026-09-25] HW1 criteria pass complete: lint in all packages, naming-conventions section in root CLAUDE.md, Stop hook wired, evidence backfilled on every INSIGHTS entry, /showcase route added, 142 server tests + 9/9 e2e green. Evidence: `CLAUDE.md:Naming conventions`.
- [2026-09-25] Planned the onion-architecture-backend skill: ring map, 13 boundary rules, cruiser-based enforcement with a violations baseline, migration order. No code changed. Plan copied to memory (onion-backend-skill-plan). Evidence: `server/docs/architecture.md:Modules`.
- [2026-09-25] Built the onion-architecture-backend skill (.claude/skills/onion-architecture-backend): SKILL.md, 7 references, example skills module, check-arch.sh; server/.dependency-cruiser.cjs with 13 rules, 31-entry baseline, pnpm lint:arch, ESLint warning mirrors, CI step. Example module verified by temporary install: typecheck, cruise, 6 tests, lint green; 106 unit tests still pass. Evidence: `server/.dependency-cruiser.cjs`.
- [2026-09-25] L02 skills: modules/skills (CRUD, body versioning, name uniqueness, .md/.zip import preview), agent link validation + version bump, skills slot fed into the prompt with per-skill log lines, seed of 13 skills + Test Quality / API Contract agents; 129 unit + 40 integration tests green, lint:arch no new violations. Evidence: `server/specs/skills.md`.

## Open Questions

- [2026-09-25] Stale-run reaping assumes one API process per DB. What replaces it if the API is ever scaled horizontally: heartbeats or per-instance run ownership? Evidence: `server/src/app.ts:reapStaleRuns`.
