# Migrating a legacy module (strangler, not big-bang)

Legacy layout: `routes.ts` + `service.ts` (takes `Container`, builds `new XRepository(container.db)`) + `repository.ts` (Drizzle, returns rows) + `helpers.ts`.

Migrate only what the current task touches, in this order — each step ships green:

1. **Routes off Drizzle.** Move any query in `routes.ts` into the repository and expose it through the service. (`routes-no-persistence` → 0 for that module.)
2. **Domain types.** Create `domain-model/<entity>.ts`; add `toDomain(row)` in the repository; service/routes stop using `$inferSelect`. Move entity rules out of `helpers.ts` onto the entity.
3. **Ports.** Extract `domain-services/ports.ts` with the repository interface the service actually uses (`RepoStore`), plus `JobQueue`/`RunEvents` if it uses `container.jobs`/`runBus`.
4. **Constructor injection.** Service constructor takes ports, not `Container`. Add `compose.ts` that builds it from the container; routes call `compose`.
5. **Rename into rings.** `service.ts` → `application-services/<use-case>.ts` (split by use case when it has several), `repository.ts` → `infrastructure/<entity>.drizzle-store.ts`, job handlers → `infrastructure/*.job.ts`.
6. **Tests.** Add fakes for the new ports; move use-case tests off Docker.
7. Run `pnpm typecheck`, unit tests and `pnpm arch:check`; the module's warnings must not grow.

Pilot: `repos` (small; `helpers.ts` is already pure; clone job shows the `JobQueue` + payload-parsing pattern).

Don't use as a template until migrated: `settings`, `polling`, `workspace`, `pulls` (Drizzle in routes), `repo-intel` (cycle through `platform/container.ts` — read its README first).
