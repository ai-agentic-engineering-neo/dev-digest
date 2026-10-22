# Infrastructure ring — Drizzle repositories

Drizzle is infrastructure. It lives in `modules/<name>/repository.ts` (or
`repository/<entity>.repo.ts` when a module owns several tables) and in `db/`. Nowhere else.

## Rules

1. **Only repositories import `drizzle-orm` and `db/schema`.** Routes, services, helpers and
   executors never do. Grep for it before finishing.
2. **One owner per table.** A table is written by exactly one repository. Other modules read it
   through that repository (exposed on the container if shared).
3. **Methods are named after business operations** — `findByFullName`, `updateClonePath`,
   `listOpenForRepo` — not `select`, `query`, `run(sql)`. A service should read like the use case.
4. **Tenancy in every query.** Each method takes `workspaceId` and filters by it. A method that
   can't be scoped must say why in a comment.
5. **Return plain data.** Rows (`typeof t.x.$inferSelect`) or plain objects. Row types may reach
   the service (ring 3) but **never** leave it — the service maps them to `@devdigest/shared`
   contracts before returning to the route.
6. **Fix driver quirks here.** `sum()` / `avg()` return numeric strings → `Number()` in the
   repository. `jsonb` columns → `Schema.parse()` (or `safeParse` + fallback) on read so old rows
   can't break the contract (see INSIGHTS "Trace jsonb is cast, not parsed").
7. **Constructor takes `Db`, nothing else.** No container, no adapters, no services.
8. **No business decisions.** "Is this PR reviewable?" is a helper/service question; the
   repository only answers "give me rows matching X".

## Transactions — the service owns the boundary

The use case decides what must be atomic; the repository just runs on whatever handle it is given.
The Drizzle transaction type stays in infrastructure.

```ts
// repository.ts (ring 4)
import type { Db } from '../../db/client.js';
export type DbOrTx = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

export class RepoRepository {
  constructor(private db: Db) {}
  /** Runs `fn` atomically; the service never sees Drizzle APIs. */
  inTransaction<T>(fn: (tx: DbOrTx) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }
  async remove(workspaceId: string, id: string, tx: DbOrTx = this.db) { /* … */ }
  async removeJobs(repoId: string, tx: DbOrTx = this.db) { /* … */ }
}

// service.ts (ring 3)
await this.repo.inTransaction(async (tx) => {
  await this.repo.removeJobs(id, tx);
  await this.repo.remove(workspaceId, id, tx);
});
```

The service passes `tx` along opaquely; it never calls `tx.select(...)` itself.

## Sources

- Sentry — [Atomic Repositories in Clean Architecture and TypeScript](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/)
- Paul Serban — [Drizzle ORM Best Practices](https://blog.paulserban.eu/post/drizzle-orm-best-practices-principles-patterns-and-real-world-case-studies/)
- [Repository Pattern in Nest.js with Drizzle ORM](https://medium.com/@vimulatus/repository-pattern-in-nest-js-with-drizzle-orm-e848aa75ecae)
- [Drizzle docs — Transactions](https://orm.drizzle.team/docs/transactions)
- Martin Fowler — [Repository](https://martinfowler.com/eaaCatalog/repository.html)
