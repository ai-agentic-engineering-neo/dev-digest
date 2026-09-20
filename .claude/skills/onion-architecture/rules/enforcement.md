# Enforcement — `pnpm arch:check` and the baseline ratchet

The layering is checked by **dependency-cruiser** (already a `server/` dependency; the indexer uses it as a library, this uses it as a linter). No ESLint is introduced; `eslint-plugin-boundaries` was considered and rejected because the repo has no ESLint toolchain.

## Commands (run in `server/`)

| Command | What it does |
|---|---|
| `pnpm arch:check` | Cruise `src/` with `.dependency-cruiser.cjs`, ignoring entries in the baseline. **Exit 1 on any new violation.** |
| `pnpm exec depcruise src --config .dependency-cruiser.cjs --output-type err` | Same, but shows *all* violations including baselined ones (no `--ignore-known`). |
| `pnpm arch:baseline` | Regenerates `.dependency-cruiser-known-violations.json` from the current code. **Only after fixing violations.** |

CI: `.github/workflows/server-unit.yml` runs the check as its own `arch` job (inlined `pnpm exec depcruise …` like the vitest step, so it doesn't depend on which scripts a local `package.json` carries).

## Rules (`server/.dependency-cruiser.cjs`)

| Rule | Forbids | Ring reasoning |
|---|---|---|
| `routes-no-persistence` | `routes.ts` → `drizzle-orm`, `db/**`, `adapters/**` | edge delegates to services |
| `inner-no-outer` | helpers/service/run-executor/findings/diff-loader/`pipeline/**` → `fastify`, `drizzle-orm`, `db/**`, `adapters/**` | rings 1–3 know only ports |
| `inner-no-container` | same set → `platform/container.ts` | no service locator |
| `only-repository-touches-db` | any other `modules/**`/`platform/**` file → `drizzle-orm`, `db/schema\|rows` | persistence is the repository's job |
| `adapters-no-modules` | `adapters/**` → `modules/**`, `db/seed`, `platform/container` | infra doesn't know features |
| `no-cross-module` | `modules/A/**` → `modules/B/**` except `_shared/`, `index.ts`, `types.ts` | modules meet at public surfaces |
| `platform-not-inward` | `platform/**` (except container) → `modules/**` | platform is below features |
| `no-circular` | import cycles (see caveat in the config comment) | inward-only graph is acyclic |

`tsPreCompilationDeps: true` is deliberate: ORM leaks are mostly `import type` / `typeof t.x.$inferSelect`, invisible after TS compilation.

## What the tool cannot catch (review + checklist)

- Row types **re-exported by a repository** (`export type { AgentRow }`, `LinkedSkillRow` in `agents/repository.ts`) — the importer looks clean once it imports from `./repository.js`. Check skill checklist item 3 in review.
- A route doing real business logic without importing anything forbidden (inline aggregation, degraded-response building).
- Snake_case DTO fields leaking into service signatures.
- A service importing its own module's concrete `repository.ts` (allowed today; see `SKILL.md` compromises).

## The ratchet

`.dependency-cruiser-known-violations.json` holds **42** entries (as generated 2026-09-19). Rules:

1. It may only **shrink**. A PR that adds an entry is rejected.
2. After a fix, run `pnpm arch:baseline` and review `git diff` of the file — it must show removals only.
3. When it is empty, delete the file and the `--ignore-known` flag.
4. This depcruise version (17.4.x) has **no** `--baseline`/`shrink-only` flags: the baseline is generated with `--output-type baseline`, hence the diff-review guard.
5. Drizzle entries embed the pnpm-resolved package path; after a drizzle upgrade regenerate once and confirm the *count* is unchanged.

## Violation map → refactor phase

**Phase 1 — persistence out of routes** (8 entries, `routes-no-persistence`)
`pulls/routes.ts` (≈20 queries, aggregation, GitHub sync), `polling/routes.ts`, `settings/routes.ts`, `workspace/routes.ts`. Also `only-repository-touches-db` for `settings/feature-models.ts` (2). Create `service.ts` + `repository.ts` for each; one shared `upsertPullRequest`.

**Phase 2 — stop row-type leakage** (`inner-no-outer` → `db/*`, 7 entries)
`repos/helpers.ts`, `reviews/{diff-loader,run-executor,service}.ts`. Introduce domain types + repository mappers. (Also fix `agents/repository.ts` exports and the `agents/repository ↔ helpers` cycle — `no-circular`.)

**Phase 3 — narrow dependencies and inward imports**
- `inner-no-container` (8): `agents`, `repos`, `reviews` (service, run-executor, diff-loader), `repo-intel` (service, `pipeline/full`, `pipeline/incremental`) → `Deps` objects. This also removes the `container ↔ repo-intel/service` and `pipeline/*` cycles (`no-circular`, 4).
- `inner-no-outer` → `adapters/*` (6): `repo-intel` service/pipelines import `astgrep`, `codeindex/extract`, `tokenizer`; `reviews/diff-loader` imports `git/diff-parser`. Introduce ports and inject.
- `adapters-no-modules` (3): move `repo-intel/constants` (used by `astgrep`, `depgraph`) to a neutral spot; `auth/local → db/seed`.
- `no-cross-module` (1): `repos/service → repo-intel/constants`.
- `only-repository-touches-db` for `platform/jobs.ts` (2): decide — move `JobRunner` under `adapters/` behind a port, or add an explicit, commented exemption.

**Phase 4 — boundary hygiene** (not detectable by the tool)
Replace `RunRequest.parse` in `reviews/routes.ts` with a route schema; move `repo-intel/routes.ts` degraded-response logic to the service; unify `CreateAgentBody`/`CreateAgentInput`.

Each phase = its own PR: refactor → `pnpm typecheck` → unit + integration tests → `pnpm arch:baseline` → confirm removals-only diff.

## Sources

dependency-cruiser [rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) · [CLI / known-violations](https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md) · Atomic Object, [Dependency Cruiser: Restrict Imports in JavaScript](https://spin.atomicobject.com/dependency-cruiser-imports/) · [eslint-plugin-boundaries](https://www.jsboundaries.dev/docs/overview/) (alternative considered).
