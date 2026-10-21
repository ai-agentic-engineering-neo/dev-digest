# Drizzle in the onion

Drizzle is a driver. It exists in ring 3a only: `modules/<m>/repository.ts`,
`db/**`, `adapters/**` that need the database (`adapters/auth/local.ts`),
`platform/jobs.ts`, and the health check in `app.ts`. Query and schema syntax
is in the vendored `drizzle-orm-patterns` skill; this file is the boundary.

## The repository implements a port and returns DTOs

```ts
// repository.ts (ring 3a)
type SkillRow = typeof t.skills.$inferSelect;          // stays private to this file
const toDto = (r: SkillRow): SkillDto => ({ ..., created_at: r.createdAt.toISOString() });

export class SkillsRepository implements SkillsRepositoryPort {
  constructor(private readonly db: Db) {}
  async list(workspaceId: string): Promise<SkillDto[]> { ... rows.map(toDto) }
}
```

- `$inferSelect` / `$inferInsert` (Drizzle "goodies") are the right way to type rows, and the wrong thing to export. `db/rows.ts` exists for cross-cutting *driven* code; a service that imports it is coupled to the table shape (rule 4, baseline entries for `reviews/service.ts` and `run-executor.ts`).
- The DTO the port returns is snake_case like the API (`created_at`), so the route returns it unchanged. If the client needs it, promote it to a Zod schema in `vendor/shared/contracts/` and have the port reference that type.
- Every method takes `workspaceId` first and puts it in the `where`. Child tables scope through their parent row (see `docs/architecture.md`, Database layer).
- Query composition (joins, `inArray`, aggregation such as the cost rollup in `run.repo.ts`) lives here. A service that needs "the latest done run per PR" asks the port for exactly that, it does not receive rows and filter them.

## Transactions

The service decides that two writes belong together; the repository makes them
atomic (rule 10):

```ts
// port
saveNewVersion(workspaceId: string, id: string, body: string): Promise<SkillDto | undefined>;

// repository
return this.db.transaction(async (tx) => {
  const [row] = await tx.update(t.skills).set({ body, version: sql`${t.skills.version} + 1` })
    .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id))).returning();
  if (!row) return undefined;
  await tx.insert(t.skillVersions).values({ skillId: row.id, version: row.version, body });
  return toDto(row);
});
```

Drizzle rolls back on a thrown error; `tx.rollback()` throws; a nested
`tx.transaction` is a savepoint (Transactions doc). Do not pass `tx` across a
port: if two repositories must share a transaction, that is one aggregate and
one repository.

## Typed tests without a database

- Service tests use an in-memory fake of the port, no Drizzle at all.
- Repository tests are `test/*.it.test.ts` against Testcontainers Postgres (`test/helpers/pg.ts`) and run migrations through `runMigrations`.
- `drizzle.mock()` (goodies) gives a typed `Db` with no connection when a driven class only needs the type at construction.

## Schema and migrations

Tables are split by domain under `db/schema/` and re-exported by the barrel
(schema declaration doc). A schema change is `edit src/db/schema/*.ts` →
`pnpm db:generate` → commit SQL + snapshot → `pnpm db:migrate`. Never edit a
generated migration; never run migrations from `buildApp`.

## drizzle-zod (optional)

`createInsertSchema(t.skills)` can derive the request body schema for a
`POST`, but the derived schema belongs to the *route* (ring 3b) and must not
leak column names the API does not expose. Prefer a hand-written route schema
when the API shape and the table shape differ, which in this codebase is the
norm (snake_case API, camelCase columns).
