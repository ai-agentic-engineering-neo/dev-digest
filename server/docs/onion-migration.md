# Onion migration: module refactor guide

This guide is for whoever refactors one feature module to the onion layout
(skill `onion-architecture`). The shared groundwork is already in place, so a
module refactor only touches `src/modules/<name>/` (plus tests and the
baseline file).

## Baseline (2026-09-22, 39 known violations)

`.dependency-cruiser.cjs` now gives **every** file under `src/modules/<m>/` a
ring. Before, files with non-ring names such as `run-executor.ts` or `pipeline/*`
were not checked at all. Any file name that isn't a ring name is treated as
**application**. The baseline (`.dependency-cruiser-known-violations.json`) was
regenerated: it went from 25 entries to 22 after the fixes below, then to 39
once the extra files were checked. **From here on it may only shrink.**

| Module | Entries | Rules |
|---|---|---|
| repo-intel | 0 (was 12) | done: `domain/` (model, rank, repo-map, rules) · `application/` (ports.ts, full/incremental index, blast, source queries; reindex via `TransactionRunner`, graph step in a savepoint) · `infrastructure/` (read + write repositories, ast-grep analyzer, contained clone reads, walk) · `service.ts` facade on ports · resync enqueue via `service.requestResync` |
| reviews | ~~10~~ **0** | done (Phase 2b): `domain/` · `application/` (ports.ts, use cases) · `repository.ts` + `repository/` (queries, mappers) · `routes.ts` + `http/schemas.ts` (zod responses from shared contracts) |
| settings | 0 (was 5) | done: `repository.ts` + `SettingsService`; `feature-models.ts` removed → `service.resolveFeatureModel` / pure `helpers.ts` |
| agents | 0 (was 3) | done: `domain.ts` (`isConfigChange`, `NewAgent`/`AgentPatch`) · row→DTO mappers in `infrastructure/mappers.ts`, repository DTO methods · service on `{ agents, llm }` · routes use shared `CreateAgentInput` + `response` schemas |
| repos | 0 (was 3) | done: `toRepoDto` moved to `repository.ts` · service on `{ repos, git, jobs }` · `InvalidInputError(…, 'invalid_repo_url')` · `response` schemas |
| pulls · polling · workspace | 0 (was 2 each) | done: repository + service + thin routes with `response` schemas; polling imports PRs through `pulls.service.importListed` (wired in its composition.ts) |

To see them all, run `pnpm exec depcruise src ../reviewer-core/src --config .dependency-cruiser.cjs --no-ignore-known`.

## What already exists (don't rebuild it)

- **Errors**: `src/platform/errors.ts`. Throw `NotFoundError`, `InvalidInputError` (400),
  `ValidationError` (422), `UnauthorizedError`, `ForbiddenError`, `ConflictError` (409),
  `ConfigError` (500), `ExternalServiceError` (502) or `InternalError`. The signature is
  `(message, details?, code?)`, and `code` overrides the wire code
  (e.g. `new InvalidInputError('Provide agentId or all:true', undefined, 'invalid_run_request')`).
  Only `src/http/error-handler.ts` knows HTTP (`STATUS_BY_KIND`). The form
  `new AppError(code, msg, status)` is **deprecated**: migrate each call site you touch.
  A `ZodError` thrown outside request validation is a 500.
- **TransactionRunner port** (`src/application/transaction.ts`, Drizzle impl
  `src/db/transaction.ts`). Build it in composition with
  `c.transactionRunner((db) => ({ agents: new AgentsRepository(db) }))`.
  The existing `repo.transaction()` helpers keep working.
- **Jobs**: `JobHandler(payload, { jobId, signal })`. `signal` aborts on timeout or
  shutdown. Forward it to git (`clone`/`sync` take `{ signal }`) and to SDK calls.
  Use `withTimeout((signal) => work(signal), ms)` in `platform/resilience.ts`
  to abort work that times out (the `withTimeout(promise, ms)` form only races).
- **Shutdown**: `Container.shutdown()` runs in `preClose`. It cancels live runs,
  stops jobs and ends SSE streams.
- **Shared constants**: `src/domain/source-scope.ts` (`SUPPORTED_EXT`,
  `MAX_SIGNATURE_CHARS`). Adapters import it, not the modules.

## The factory pattern

Each module owns its wiring in `src/modules/<m>/composition.ts`:

```ts
export function buildAgentsModule(c: Container) {
  const agents = new AgentsRepository(c.db);
  return {
    service: new AgentsService({
      agents,
      llm: (p) => c.llm(p),
      tx: c.transactionRunner((db) => ({ agents: new AgentsRepository(db) })),
    }),
    // jobs: { [KIND]: (payload, { signal }) => … }   ← registered at boot by the Container
  };
}
```

- `modules/composition.ts` lists the factories. `Container.modules.<m>` builds
  each module lazily, and its type is inferred from the factory, so **don't edit
  `platform/container.ts`**.
- Routes read `app.container.modules.<m>.service`. They never call `new` on a
  service or repository.
- Other modules' needs: use the shared container repositories (`c.agentsRepo`,
  `c.reviewRepo`), the `c.repoIntel` facade, or another module's `index.ts`,
  never its internals.
- `composition.ts` and `index.ts` are outside the ring rules (they are composition
  root / barrel code). Keep them free of logic.

## Steps for one module

1. Read `server/INSIGHTS.md`, the skill, and this module's rows in the table above.
2. **Service deps**: change `constructor(private container: Container)` to
   `constructor(private deps: { … })` with only the ports it uses. Keep the
   repository import as `import type`. Build the real deps in `composition.ts`.
3. **Unconventional files**: rename or move them into a ring
   (`application/`, `domain/`, `infrastructure/`), e.g.
   `reviews/run-executor.ts` → `reviews/application/run-executor.ts`,
   `repo-intel/pipeline/walk.ts` (fs I/O) → `infrastructure/`. Give them deps
   objects instead of `Container`.
4. **Routes with Drizzle** (pulls, polling, settings, workspace): add
   `repository.ts` methods (read models) and `service.ts` use cases, wire them in
   `composition.ts`, and make the route call the service.
5. **helpers → repository**: row→DTO mappers are infrastructure, so move them
   next to the repository, or type them against the `@devdigest/shared` contract.
6. **Errors**: replace `new AppError(code, msg, status)` with a subclass. Keep the
   wire `code`, since the client and tests match on it.
7. Tests: services get in-memory fakes via their constructor; routes use
   `buildApp({ overrides })`. `*.it.test.ts` is for anything touching Postgres.
8. Check: `pnpm typecheck` → `pnpm test` → depcruise `--ignore-known` → rebaseline
   `pnpm exec depcruise src ../reviewer-core/src --config .dependency-cruiser.cjs --no-ignore-known --output-type baseline --output-to .dependency-cruiser-known-violations.json`.
   `git diff` of the baseline must **only remove** entries.
