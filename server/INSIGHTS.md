# server — insights

Non-obvious lessons learned while working in `server/`. Maintained by the `engineering-insights` skill.
Append-only: new lines go at the end of their section; corrections are new dated entries.
Format: `- YYYY-MM-DD — <what is true / what happened> → <what to do instead> (path:line → symbol)`.
Add an entry only if forgetting it would make an agent (or a human) repeat the mistake.

## What Works
<!-- Approaches that proved effective here -->

## What Doesn't Work
<!-- Dead ends and antipatterns — the most valuable section -->
- 2026-11-05 — `options.exclude` in .dependency-cruiser.cjs removes the module AND all edges to it, so `exclude: ^src/vendor/` silently killed `domain-shared-type-only` (a clean run looked green; caught by the PR #12 AI review) → for paths rules point AT use `doNotFollow`, and prove rules with `node scripts/check-architecture.mjs --self-test` (.dependency-cruiser.cjs → options.doNotFollow).
- 2026-11-05 — `POST /agents/:id/skills` used to link ANY skill uuid (only the agent was workspace-checked), i.e. cross-workspace links were possible → link tables must check BOTH sides' workspace; skill ids are now validated (404) and duplicates rejected (422) (src/modules/agents/service.ts:181 → assertWorkspaceSkills).

## Codebase Patterns
<!-- Conventions and architecture decisions, with the reason -->
- 2026-11-04 — There is no base-repository/workspace guard; scoping is manual per query → always add `eq(t.x.workspaceId, workspaceId)` from `getContext` (src/modules/_shared/context.ts:14 → getContext).
- 2026-11-04 — `ReviewService` builds `new ReviewRepository(container.db)` instead of `container.reviewRepo` → can't be swapped via overrides; prefer the container getter in new code (src/modules/reviews/service.ts:34 → ReviewService constructor).
- 2026-11-04 — `reviewPullRequest` already returns `costUsd`, but the executor drops it and `agent_runs.cost_usd` was removed in migration 0009; on a thrown chunk all usage is lost and the failure path writes tokens 0 → to persist partial spend, collect per-chunk usage via a callback, not from `outcome` (src/modules/reviews/run-executor.ts:139 → runOneAgent, partial spend via `UsageTally` at :157; spec: specs/run-cost-badge.md).
- 2026-11-05 — Layering is enforceable with the already-installed dependency-cruiser; baseline is 24 errors (Drizzle in 4 routes, adapters imported by services, `adapters/{astgrep,depgraph}` importing `modules/repo-intel/constants`) → before/after backend changes run `node node_modules/dependency-cruiser/bin/dependency-cruise.mjs src --config ../.claude/skills/onion-architecture/depcruise-rules.cjs --output-type err` and add no new violations (../.claude/skills/onion-architecture/examples.md → Known violations).
- 2026-11-05 — Correction: layer rules moved to `.dependency-cruiser.cjs` and the check is now `node scripts/check-architecture.mjs` (CI job `architecture` in server-unit.yml); legacy violations frozen in `architecture-baseline.json`, which may only shrink → after fixing a violation run `--update` and commit the smaller baseline; never `--update` to absorb a new one (scripts/check-architecture.mjs → keyOf).
- 2026-11-05 — Skills: per-agent "checked" = an `agent_skills` row (the table has no per-link enabled flag); `skills.enabled` is GLOBAL and filtered in the prompt query; trust comes from `source` (manual/extracted trusted, community/imported_url untrusted) → don't add a link-level enabled or a `trusted` column without a migration decision; resolve run skills only via `container.skillsRepo.promptSkillsForAgent` (src/modules/skills/repository.ts:147 → promptSkillsForAgent; src/modules/skills/domain.ts:12 → isTrustedSkillSource).
- 2026-11-05 — `/pr-self-review` marks ANY edit under `*/src/vendor/shared/**` as a NON-waivable critical (even purely additive contracts); its report suggests "approve the change yourself", but that never unblocks the gate → put new API DTO types in the module (server: src/modules/skills/domain.ts:60 → SkillImportPreview; client mirror in client/src/lib/types.ts) instead of vendor/shared (../.claude/skills/pr-self-review/scripts/checks.mjs:69 → policy/do-not-touch-vendor-shared).
- 2026-11-05 — Skill content rules (kebab-case name, non-empty body, body ≤ `MAX_SKILL_BODY_CHARS` 50k) live in the SERVICE, shared by create/update/import; route Zod only checks shape — a pr-self-review zod finding "manual POST/PUT bypasses the 50k limit" was a false positive → before adding a route-level `.max()`, check `assertBody`/`assertName`; extend them, don't duplicate (src/modules/skills/service.ts:45 → assertBody; test/skills-service.test.ts → "enforces MAX_SKILL_BODY_CHARS").

## Tool & Library Notes
<!-- Dependency / tooling quirks -->
- 2026-11-04 — pgvector is enabled only by `runMigrations()` (`src/db/migrate.ts`), no migration .sql does it → migrate via `pnpm db:migrate`, never `drizzle-kit migrate`, or `vector(1536)` columns fail (src/db/migrate.ts:23 → runMigrations).
- 2026-11-04 — On Windows `pnpm <script>` can fail with "Access is denied" → call bins via node: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`, `node node_modules/vitest/vitest.mjs run --exclude '**/*.it.test.ts'`, `node node_modules/drizzle-kit/bin.cjs generate` (package.json → scripts).
- 2026-11-05 — dependency-cruiser 17 rejects `to: { circular: true, viaNot: { path: … } }` ("viaNot must be string") → use the string form `viaNot: '^src/platform/container\\.ts$'`; container.ts cycles are expected (services `import type { Container }`) (../.claude/skills/onion-architecture/depcruise-rules.cjs → no-circular).
- 2026-11-05 — dependency-cruiser's `--ignore-known` baseline matches RESOLVED paths; under pnpm those are `node_modules/.pnpm/drizzle-orm@<ver>_…/…/index.d.ts` → any dependency bump makes known violations "new". `preserveSymlinks` drops the version but not the entry file; `collapse` doesn't help (applied at report time, after known-violation matching — main/report-wrap.mjs) → match on normalized keys `rule|from|node_modules/<pkg>` instead (scripts/check-architecture.mjs → normalizeTarget).

## Recurring Errors & Fixes
<!-- Symptom → root cause → fix -->
- 2026-11-04 — `test/indexer-pipeline.test.ts` (runIncremental, 6 tests) fails on Windows with ENOENT: its `writeFileAt` helper splits paths on `'/'` only → pre-existing, unrelated to feature work; don't chase it as a regression (test/indexer-pipeline.test.ts:140 → writeFileAt).
- 2026-11-04 — On Windows `db:migrate` / `db:seed` exit 0 with NO output and create no tables: the CLI guard `import.meta.url === \`file://${process.argv[1]}\`` never matches (`file:///F:/…` vs `F:\…`) → verify with `docker exec devdigest-postgres psql -U devdigest -d devdigest -c '\dt'`; workaround: a temp `.mts` that imports and awaits `runMigrations(url)` and `seed(createDb(url).db)`, run via `node node_modules/tsx/dist/cli.mjs` (src/db/migrate.ts:37, src/db/seed.ts:227 → CLI entrypoint guard).
- 2026-11-05 — The PR #12 review claimed `@devdigest/shared` resolves to `node_modules/@devdigest/shared` — false: tsconfig `paths` resolves it to `src/vendor/shared/index.ts` (`aliased-tsconfig-paths`) → match rules on `^src/vendor/shared/`; verify reviewer claims with a probe file before applying their suggested fix (tsconfig.json → paths).
- 2026-11-05 — A skill .zip made with PowerShell 5.1 `Compress-Archive` failed import with "Archive must contain SKILL.md": it stores entries as `dir\SKILL.md`, which the zip-slip guard flagged as unsafe (unit-test zips used `/`, so tests were green) → normalize `\`→`/` when reading the central directory, then reject `..`/absolute/drive paths; test imports with a real Windows-made zip (src/modules/skills/import/zip-reader.ts:80 → listZipEntries; src/modules/skills/import/skill-import.ts:43 → isUnsafePath).
- 2026-11-05 — CORRECTION of 2026-11-04 entry (indexer-pipeline ENOENT): fixed — `writeFileAt` now does `mkdir(dirname(full))`, all 131 server unit tests pass on Windows → a failure there is now a real regression, not the known Windows issue (test/indexer-pipeline.test.ts:140 → writeFileAt).

## Session Notes
<!-- Wrap-up: one dated line per substantive task -->
- 2026-11-04 — Specced + implemented Run Cost Badge (`agent_runs.cost_usd` via migration 0010, `UsageTally` partial spend, PR-list SUM) → specs/run-cost-badge.md.
- 2026-11-04 — First local launch on Windows (Docker Postgres + migrate/seed workaround), PR #1 reviewed end-to-end via OpenRouter agents.
- 2026-11-05 — Created the `onion-architecture` skill (ring rules per tool + dependency-cruiser layer check, baseline 24 errors) → .claude/skills/onion-architecture/SKILL.md.
- 2026-11-05 — Added CI baseline mode for the Onion layer check (version-proof keys, shrink-only vs base branch) → scripts/check-architecture.mjs, .github/workflows/server-unit.yml (architecture).
- 2026-11-05 — Fixed dead `domain-shared-type-only` rule (exclude → doNotFollow), de-duplicated `application-no-adapters`, added `--self-test` probes for all 10 rules + CI step → scripts/check-architecture.mjs.
- 2026-11-05 — Skills feature: `modules/skills` (CRUD + versions + .md/.zip import preview→confirm), skills wired into run-executor + trace, Test Quality / API Contract reviewers + 8 seed skills → specs/skills.md.
- 2026-11-05 — Cleared pr-self-review BLOCK: import-preview types moved out of vendor/shared, writeFileAt fixed, zip total-size budget enforced before inflate, empty `PUT /skills/:id` → 422.
- 2026-11-05 — pr-self-review PASS follow-ups: seedSkills skill+v1 in one transaction, body-limit unit test (route finding was a false positive).

## Open Questions
<!-- Unresolved items, known gaps -->
- 2026-11-04 — `GET /runs/:id/events`, `POST /runs/:id/cancel`, `GET /runs/:id/trace`, `GET /repos/:id/index-state` call `getContext` but ignore `workspaceId` (harmless while single-workspace) → scope them before adding real auth (src/modules/reviews/routes.ts:49/:114/:121, src/modules/repo-intel/routes.ts:33).
