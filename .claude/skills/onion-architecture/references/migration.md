# Migrating a legacy module

Most of `server/src/modules/*` predates this skill. Migrate **one module per PR**, behaviour-
identical, with existing tests green before and after. Don't mix a migration with feature work.

## Inventory (2026-11-24, after the full migration)

The depcruise baseline is **empty**: every module follows the dependency rules.
What is left is structural, not a rule violation:

| Leftover | Where | When to do it |
|---|---|---|
| Facade not split into rings (still imports `adapters/*`, `platform/*` directly — legal outside an `application/` folder). Already split by **size** (S4, 2026-11-25): use-case files + `repository/` queries | `repo-intel/*.ts` + `pipeline/` | When the module next gains features |
| `reviews` repository returns Drizzle rows, not mapped domain objects. Harmless: the rows match the domain types in `reviews/domain/types.ts` structurally and the use cases see only the port | `reviews/infrastructure/review.repository.ts` | Add `mappers.ts` only if a row and its domain type diverge |
| `getContext(container, req)` takes the Container | `_shared/context.ts` | Fine as is: only `index.ts` factories call it |
| `AppError` subclasses with HTTP status | `platform/errors.ts`, used only by adapters (`ExternalServiceError`) and the container (`ConfigError`) | Fine as is — outer rings only; modules throw `DomainError`s |

The authoritative, always-current list is the baseline itself — print it with:
```bash
cd server && pnpm exec depcruise src --config .dependency-cruiser.cjs --no-ignore-known --output-type err
```

## Order

1. **agents** — pilot, **done 2026-11-24**: `domain/ application/ infrastructure/ http/` + `index.ts`; UoW (`_shared/domain/unit-of-work.ts`, `DrizzleAgentsUnitOfWork`), `DomainError` + `DOMAIN_STATUS` in `platform/errors.ts`. Use it as the reference module. Leftover: `reviews` still types agents as `AgentRow` (works because the domain `Agent` mirrors the row) — switch it to the `AgentsRepository` port when `reviews` migrates.
2. **settings**, **workspace**, **polling**, **pulls** — **done 2026-11-24**. Shared kernel grew: `RepoNotFound`, `DomainError.details`, `Logger` port (`_shared/domain/`). Patterns worth copying: a single-aggregate atomic write may run `db.transaction` inside the repository method (`recordPoll`, `storeDetail`, settings `upsert`) — use a UoW only when a use case spans several repository calls; jsonb is parsed in infrastructure (`settings` `featureModelOverride`); secrets/SDK probes become small ports adapted in `index.ts` (`settings`).
3. **repos** — **done 2026-11-24**. Job kinds moved to `_shared/job-kinds.ts` (repo-intel re-exports them); `JobScheduler` port in `_shared/domain/jobs.ts` (JobRunner satisfies it structurally); `InvalidRepoUrl` domain error. Lazily-resolved adapters are passed as factories (`git: () => c.git`) so test overrides and new tokens are picked up per job.
4. **repo-intel** — **done 2026-11-24 (narrow deps)**: `RepoIntelService` takes `RepoIntelDeps`, the pipeline takes `IndexerDeps`; `container.repoIntelService` builds them with lazy getters (adapters still built on first use); routes in `http/`, `index.ts` factory registers the job handlers; `SUPPORTED_EXT`/`MAX_SIGNATURE_CHARS` moved to `adapters/code-scope.ts` (re-exported by `constants.ts`). Not done: the ring split of the 765-line facade and the pipeline (they still import `adapters/*` and `platform/contained-read` directly — legal for a non-`application/` folder). Do it with S4 when the facade gains features.
5. **reviews** — **done 2026-11-24 (narrow deps)**: `ReviewService` takes `ReviewDeps` (repository, `AgentsReader`, RunBus, `llmFor`, `ReviewContextSource`, git); `container.reviewService` builds it (lazy `repoIntel`/`git` getters) and is shared by the routes and the boot reaper in `app.ts`. Agents and repo-intel are reached through reviews-local ports (`types.ts`) that the other modules satisfy structurally — no cross-module import. Repository moved to `infrastructure/`; routes to `http/`; domain errors in `errors.ts`; `PullNotFound` moved to the shared kernel. **Ring split done 2026-11-25:** `domain/types.ts` (PullRequest, Review, ReviewFinding, RepoCoordinates, … — the fields the use cases read, named like the rows), `domain/ports.ts` (`ReviewsRepository`, `AgentsReader`, `ReviewContextSource`, `RunEvents`, `RunLog`, `DiffParser`, `ReviewRunDeps`/`ReviewDeps`), and `service.ts`, `run-*.ts`, `diff-loader.ts`, `findings.ts`, `helpers.ts`, `constants.ts` in `application/`, so `application-no-outer-rings` covers them. `ReviewRepository implements ReviewsRepository`; the container injects `openRunLog` (wraps `platform/run-logger.ts` RunLogger) and `parseDiff` (`adapters/git/diff-parser.ts`). `POST /pulls/:id/review` validates its body via `schema.body` (`http/schemas.ts` `ReviewRunBody`: Fastify passes a missing body as `null`, which maps to `{}`).
6. `platform/errors.ts` — **done**: no module throws `AppError`; it remains for adapters/container only.

## Steps for one module

1. **Read** its routes, service, repository, helpers, tests. List use cases (one per route-intent).
2. **Domain**: create `domain/types.ts` (camelCase domain types, `import type` vocab from shared),
   `domain/errors.ts` (`XNotFound` etc.), move pure rules from `helpers.ts`/repository into
   `domain/policies.ts`. Unit-test policies.
3. **Ports**: `domain/ports.ts` with the repository interface the use cases need (domain types in/out).
4. **Infrastructure**: move the Drizzle repository to `infrastructure/`, make it `implements` the
   port, return domain types via `infrastructure/mappers.ts`. Strip business decisions out.
   Add a UoW where a use case writes more than once.
5. **Application**: rewrite the service to take `XDeps` (ports + factories); throw domain errors
   instead of returning `undefined` for "not found". Unit-test it with in-memory fakes.
6. **HTTP**: move `routes.ts` to `http/`, add `presenter.ts` (domain → contract; reuse the old
   `toXDto` logic) and command mapping; routes take `{ service, auth }` via plugin options.
7. **Wiring**: `index.ts` factory builds the service from `app.container`; `modules/index.ts`
   imports `./<f>/index.js` instead of `./<f>/routes.js`; container getters become port-typed.
   Note `repo-intel/index.ts` already exists as a facade export — merge carefully, don't overwrite.
8. **Errors**: add the new codes to the domain-code → status table; check responses are unchanged
   (same status, same `{ error: { code, message } }` body) — the client depends on them.
9. **Verify**: `pnpm typecheck`, unit tests, the module's `*.it.test.ts`. The architecture test
   will now fail with "baseline entries no longer occur" — that's expected: shrink the baseline with
   `pnpm exec depcruise-baseline src --config .dependency-cruiser.cjs` and check its diff only
   **removes** lines. Any added line means the refactor introduced a violation.
10. Update `server/README.md` ("API map", "Request & DI flow") if wiring changed.

## Pitfalls

- **Contract drift.** Presenters must reproduce today's DTOs byte-for-byte (snake_case keys,
  `null` vs missing, ISO dates). Snapshot a few responses before refactoring.
- **Silent 404 → 500.** When replacing `return undefined` + route `NotFoundError` with a domain
  error, make sure the code is mapped, or the handler falls through to 500.
- **Shared repositories.** `container.agentsRepo` / `container.reviewRepo` are used by other
  modules (e.g. reviews reads agents). Change their type to the port and update consumers in
  the same PR, or keep a temporary adapter.
- **Scope creep.** Don't redesign tables or contracts during a migration; that's a separate change.
