# Drizzle as an outbound adapter

Drizzle is infrastructure. The schema (`pgTable`), the query builder, inferred
row types and transactions belong to the outer ring. The application sees
**ports** (`NoteStore`, `UnitOfWork`, `SimilaritySearch`) and **read models**.

## Rules

1. `drizzle-orm`, `src/db/schema*`, `src/db/rows.ts`, `src/db/client.ts` may be
   imported only by repository files (`repository.ts`, `repository/*.repo.ts`,
   `mappers.ts`) and by `src/db/**`, `src/platform/**`, `src/adapters/**`.
   Enforced by `drizzle-only-in-repositories` / `service-no-infrastructure`.
2. **One repository per aggregate/table cluster**, owned by one module. Other
   modules reach it through a `Container` getter, never by import
   (`no-cross-module-internals`).
3. **Return read models, not rows.** Define the shape in `ports.ts`; map with
   a `toRecord(row)` function in the repository. Row types (`$inferSelect`) are
   private to the adapter.
   - Legacy: many repositories return `XRow` from `src/db/rows.ts`. When you
     touch such a method, return a read model for *new* methods; convert an
     existing method only if you are changing its callers anyway.
4. **Queries are workspace-scoped** in the repository (existing tenancy rule) —
   the service passes `workspaceId`, the repository enforces it.
5. **No business decisions in SQL-building code** beyond filtering/sorting the
   use case asked for. "Can this transition happen?" is a domain question.
6. **Schema changes:** edit `src/db/schema/*`, run `pnpm db:generate`, never
   edit `src/db/migrations/**` (root CLAUDE.md). Migrations are not applied on
   boot — `pnpm db:migrate`.
7. **Read-side shortcuts are allowed in the adapter**: a repository method may
   join several tables and return a purpose-built view model (CQRS-lite) — it
   is still behind a port, and the service still doesn't see Drizzle.

## Unit of Work (transactions)

The codebase has no transactions yet. When a use case must write several tables
atomically, introduce a port — don't pass `db`/`tx` into the service.

```ts
// modules/<m>/ports.ts
export interface NoteTxRepos {
  notes: NoteStore;
  audit: AuditStore;
}
export interface UnitOfWork {
  run<T>(work: (repos: NoteTxRepos) => Promise<T>): Promise<T>;
}
```

```ts
// modules/<m>/repository.ts (adapter side)
import type { Db } from '../../db/client.js';

/** Db or a transaction handle — repositories accept either. */
type DbOrTx = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

export class NoteRepository implements NoteStore {
  constructor(private readonly db: DbOrTx) {}
  // …
}

export class DrizzleNotesUnitOfWork implements UnitOfWork {
  constructor(private readonly db: Db) {}
  run<T>(work: (repos: NoteTxRepos) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) =>
      work({ notes: new NoteRepository(tx), audit: new AuditRepository(tx) }),
    );
  }
}
```

```ts
// service.ts
await this.deps.uow.run(async ({ notes, audit }) => {
  const n = await notes.insert({ … });
  await audit.record({ noteId: n.id, action: 'created' });
});
```

- Throwing inside `work` rolls back (Drizzle rejects the transaction promise).
- Keep external calls (LLM, GitHub, git) **outside** the transaction — never
  hold a DB transaction open across a network call.
- If the `DbOrTx` alias is needed by a second module, move it to
  `src/db/client.ts` (it's infrastructure, not a module type).
- Pattern source: Sentry, *Atomic Repositories in Clean Architecture and
  TypeScript*; Fowler, *Unit of Work*.

In unit tests the fake UoW just calls `work(fakeRepos)`.

## pgvector / similarity search

Vector search is a capability, not a table detail. Put it behind a port:

```ts
export interface SimilaritySearch {
  nearest(workspaceId: string, embedding: number[], k: number): Promise<{ id: string; score: number }[]>;
}
```

The adapter owns the operator (`cosineDistance`, `<=>`), index hints and the
`vector` column; the service owns *what* to search for and what to do with hits.
The embedding itself comes from the `Embedder` port (`container.embedder()`),
which may throw when embeddings are disabled — callers degrade gracefully
(existing convention in `container.ts`).

## Legacy patterns you'll meet (don't copy)

| Where | Pattern | On touch |
|-------|---------|----------|
| `pulls/routes.ts`, `workspace/routes.ts`, `settings/routes.ts`, `polling/routes.ts` | Drizzle queries in route handlers | move the touched query into a repository method + service call |
| `repos/helpers.ts` `toRepoDto(row: $inferSelect)` | DTO mapper takes a row | introduce a read model; mapper takes it |
| `reviews/service.ts`, `run-executor.ts` → `src/db/rows.ts` | row types in application code | new methods return read models |
| `*/service.ts` `new XRepository(container.db)` | service builds its own repository | inject via constructor from `compose.ts` |
