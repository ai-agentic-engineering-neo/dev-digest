# Known legacy violations (fix on touch)

Snapshot 2026-09-22: 25 entries in `server/.dependency-cruiser-known-violations.json`.
**Superseded (Phase 2a):** every module file is now classified (non-ring names count as
application), the baseline is 39 entries, and the current per-module table + refactor
steps live in `server/docs/onion-migration.md`. The adapters → repo-intel/constants and
repos → repo-intel/constants entries are fixed; `AppError.statusCode` is replaced by a
kind → status table in `server/src/http/error-handler.ts`; `TransactionRunner` exists
(`server/src/application/transaction.ts`).
Policy: new code never adds entries. When you change a module listed here, fix its
entries in the same PR and shrink the baseline (SKILL.md section 9).

## Contents
- Summary by module
- Recipes per rule
- Not caught by the checker

## Summary by module

| Module / area | Rule(s) | Entries | Fix on touch |
|---|---|---|---|
| `pulls/routes.ts`, `settings/routes.ts`, `polling/routes.ts`, `workspace/routes.ts` | http-no-data-access | 8 | move queries to `repository.ts`, add `service.ts` methods |
| `agents`, `repos`, `reviews`, `repo-intel` `service.ts` | application-no-service-locator | 4 | constructor takes ports object; wire in `container.ts` |
| same four `service.ts` | application-repository-type-only | 4 | receive the repository instance; keep `import type` only |
| `reviews/service.ts` → `db/rows.ts` | application-no-infrastructure | 1 | use domain/contract type (`Agent`) instead of `AgentRow` |
| `repo-intel/service.ts` → `adapters/astgrep`, `adapters/codeindex/extract` | application-no-infrastructure | 2 | inject via ports (`CodeIndex`, a symbol-extractor port) |
| `agents/helpers.ts`, `reviews/helpers.ts` → own `repository.ts` | domain-is-pure | 2 | move row→DTO mappers to the repository (they are infrastructure) or type against the contract |
| `repos/helpers.ts` → `db/schema.ts` | domain-is-pure | 1 | move DB-touching helpers to `repository.ts` |
| `adapters/astgrep`, `adapters/depgraph` → `modules/repo-intel/constants.ts` | adapters-no-modules | 2 | pass limits via adapter options or move the constants to `@devdigest/shared` |
| `repos/service.ts` → `repo-intel/constants.ts` | no-cross-module-internals | 1 | export needed values from `repo-intel/index.ts` |

## Recipes per rule

**http-no-data-access** — route with inline Drizzle:
1. Add a repository method returning a read model.
2. Add a use-case method calling it (+ workspace scoping).
3. Route calls the use case; delete the `drizzle-orm` / `db/schema` imports.
4. Move/extend tests: repository → `*.it.test.ts`, route → `inject()`.

**application-no-service-locator / repository-type-only**:
1. `constructor(private deps: { agents: AgentsRepository; llm: LlmFor })`, with
   `import type { AgentsRepository }`.
2. Build it in `Container` (lazy getter) with the real repository and adapters.
3. Routes use `app.container.<name>Service` instead of `new XxxService(app.container)`.
4. Tests pass fakes directly to the constructor.

**domain-is-pure** — helper imports repository/schema:
- If the helper maps rows → DTO, it is a mapper: move it next to the repository.
- If it only needs a type, use the contract type from `@devdigest/shared`.

## Not caught by the checker

- `AppError.statusCode` in `platform/errors.ts`: HTTP knowledge in the inner rings.
  Target: errors carry only `code`; the root error handler owns a `code → status`
  table. Change in one PR (handler + errors), keep the response envelope.
- `platform/` mixes composition root (`container.ts`, `config.ts`), infrastructure
  (`sse.ts`, `jobs.ts`, `resilience.ts`) and application-level logic
  (`model-router.ts`, `prompt.ts`, `price-book.ts`). Place new code in the proper
  ring instead of `platform/`.
- Files in modules outside the ring names (`reviews/run-executor.ts`,
  `diff-loader.ts`, `findings.ts`, `usage-meter.ts`, `pulls/status.ts`,
  `repo-intel/pipeline/`, `settings/feature-models.ts`) are unchecked. When touched,
  rename/move them into a ring (`application/`, `domain/`, `infrastructure/`).
- `reviewer-core/src/llm/openrouter.ts` is an SDK adapter inside the core package —
  tolerated (rule `reviewer-core-sdk-only-in-llm`); keep SDK use confined to `src/llm/`.
- No transactions yet: multi-write use cases (e.g. agent + version) should adopt
  the `TransactionRunner` port from `drizzle.md` when touched.
