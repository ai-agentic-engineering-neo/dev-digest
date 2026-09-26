# Transactions without leaking Drizzle inwards

The use case decides *what* must be atomic, so the service owns the boundary.
But the service is in the application ring and may not import `drizzle-orm` or
`db/client`. The answer is a small port: `UnitOfWork`, with an opaque `TxScope`
that the service passes along without being able to use.

This is the shape from Sentry's *Atomic Repositories in Clean Architecture and
TypeScript*, adapted to Drizzle 0.38 and this repo's rings. The code below
typechecks against `server/` as of 2026-09-21.

## The port (framework-free)

```ts
// src/platform/unit-of-work.ts
declare const txBrand: unique symbol;

/** An open transaction. Opaque on purpose: only infrastructure can run queries on it. */
export type TxScope = { readonly [txBrand]: true };

export interface UnitOfWork {
  run<T>(work: (tx: TxScope) => Promise<T>): Promise<T>;
}
```

## The implementation (infrastructure)

```ts
// src/db/unit-of-work.ts
import type { Db } from './client.js';
import type { TxScope, UnitOfWork } from '../platform/unit-of-work.js';

type DrizzleTx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type Executor = Db | DrizzleTx;

export class DrizzleUnitOfWork implements UnitOfWork {
  constructor(private db: Db) {}
  run<T>(work: (tx: TxScope) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx as unknown as TxScope));
  }
}

/** Repositories call this first: the open transaction if there is one, else the pool. */
export const executor = (db: Db, tx?: TxScope): Executor =>
  (tx as unknown as DrizzleTx | undefined) ?? db;
```

Wire it once in `platform/container.ts` (`get uow() { return (this._uow ??= new DrizzleUnitOfWork(this.db)); }`)
and hand it to services through their `Deps`.

## The repository

Every write method takes an optional `tx` and runs **every** statement on the
executor. One statement on `this.db` inside a use case that opened a transaction
escapes it silently.

```ts
async replaceFiles(prId: string, files: PrFileInput[], tx?: TxScope): Promise<void> {
  const q = executor(this.db, tx);
  await q.delete(t.prFiles).where(eq(t.prFiles.prId, prId));
  if (files.length > 0) await q.insert(t.prFiles).values(files.map((f) => ({ prId, ...f })));
}
```

## The service

```ts
async refreshDetail(workspaceId: string, prId: string) {
  const pr = await this.deps.pulls.get(workspaceId, prId);          // read
  const detail = await (await this.deps.github()).getPullRequest(…); // external call — OUTSIDE the tx
  await this.deps.uow.run(async (tx) => {                            // atomic writes only
    await this.deps.pulls.replaceFiles(pr.id, detail.files, tx);
    await this.deps.pulls.replaceCommits(pr.id, detail.commits, tx);
    await this.deps.pulls.updateStats(pr.id, detail, tx);
  });
}
```

## Rules

- Open the transaction **after** every external call. An HTTP or LLM call inside a
  transaction holds a pooled connection and row locks for seconds.
- Keep the transaction to the writes of one use case. Do not pass `tx` into
  another service.
- Tests: the application-ring unit test gives a fake `UnitOfWork` whose `run`
  just calls `work({} as TxScope)`; atomicity itself is verified once in a
  `*.it.test.ts` that forces the second statement to fail and asserts the first
  was rolled back.
- `postgres-js` transactions and savepoints: Drizzle maps a nested
  `tx.transaction()` to a savepoint. Prefer one flat transaction per use case; reach
  for nesting only when a sub-step must roll back on its own.

## Where it applies today

There is no `db.transaction()` in `server/` yet (see `server/INSIGHTS.md`).
The first candidate is the GitHub refresh in `GET /pulls/:id`
(`modules/pulls/routes.ts`), which deletes and reinserts `pr_files` and
`pr_commits` as separate statements. Its catch branch then serves the
persisted files, which may by then be empty. Worked migration:
`examples.md`, example 2.
