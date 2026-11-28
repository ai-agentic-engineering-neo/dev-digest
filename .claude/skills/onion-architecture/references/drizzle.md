# Drizzle = infrastructure only

Palermo: "The database is not the center. It is external." Only the repository *interface* is in the core.

## Port in the core
```ts
// domain-services/ports.ts
import type { Repo } from '../domain-model/repo.js';
export interface RepoStore {
  findByFullName(workspaceId: string, fullName: string, tx?: TxHandle): Promise<Repo | undefined>;
  insert(input: NewRepo, tx?: TxHandle): Promise<Repo>;
}
/** Opaque to the core — only infrastructure knows it is a Drizzle tx. */
export type TxHandle = { readonly __tx: unique symbol };
export interface UnitOfWork {
  run<T>(fn: (tx: TxHandle) => Promise<T>): Promise<T>;
}
```

## Implementation in infrastructure
```ts
// infrastructure/repo.drizzle-store.ts
import { and, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]; // postgres-js PgTransaction, no hand-written generics
type Executor = Db | Tx;
const exec = (db: Db, tx?: TxHandle): Executor => (tx as unknown as Tx | undefined) ?? db;

export class DrizzleRepoStore implements RepoStore {
  constructor(private db: Db) {}
  async findByFullName(workspaceId: string, fullName: string, tx?: TxHandle) {
    const [row] = await exec(this.db, tx).select().from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, fullName)));
    return row && toDomain(row);            // rows never leave this file
  }
}

export class DrizzleUnitOfWork implements UnitOfWork {
  constructor(private db: Db) {}
  run<T>(fn: (tx: TxHandle) => Promise<T>) {
    return this.db.transaction((tx) => fn(tx as unknown as TxHandle));
  }
}
```

## Rules
- `drizzle-orm`, `postgres`, `db/schema`, `db/client` are imported only in `infrastructure/`, legacy `repository.ts` / `repository/`, `src/db/**`.
- Every method takes `workspaceId` and filters by it (tenancy guard) — the port signature makes it impossible to forget.
- `$inferSelect` / `$inferInsert` types stay private to the repository; map with `toDomain(row)` / `toRow(entity)` in a `*.mapper.ts` beside it.
- Transactions are started by the **use case** through `UnitOfWork.run`, never inside a repository method, so several repositories can share one tx (Sentry, "Atomic repositories"). Inside the callback every call must use `tx` — a call on the outer `db` runs outside the transaction.
- Nested `run` → Drizzle savepoints (`tx.transaction`); roll back by throwing (an `AppError`), not by `tx.rollback()` from the core.
- Don't copy Sentry's `tx?: any`; keep `TxHandle` opaque.
- Schema changes: edit `src/db/schema/*.ts` + `pnpm db:generate`; never touch `src/db/migrations/**`.
- Drizzle query syntax → `drizzle-orm-patterns` skill; table design → `postgresql-table-design`.
