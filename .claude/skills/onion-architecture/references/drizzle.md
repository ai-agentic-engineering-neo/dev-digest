# Drizzle: infrastructure ring

## Contents
- What stays in infrastructure
- Repository shape
- Mappers
- Transactions (TransactionRunner port)
- pgvector and read models
- Error translation

## What stays in infrastructure

`drizzle-orm` imports, `src/db/schema/*` tables and relations, `src/db/rows.ts`
row types, migrations, raw `sql` fragments, `db`/`tx` handles. None of these appear
in `domain`, `service.ts` (except `import type` of the module's own repository —
pragmatic CRUD) or `routes.ts`.

Tables live in `src/db/schema/<area>.ts` and are exported for drizzle-kit;
migrations are generated (`pnpm db:generate`), never hand-edited once committed.

## Repository shape

Illustrative (method and mapper names are examples):

```ts
// modules/agents/repository.ts
export class AgentsRepository {
  constructor(private db: Db | Tx) {}

  /** Named after the use case's need, not after SQL. */
  async listForWorkspace(workspaceId: string): Promise<Agent[]> {
    const rows = await this.db.select().from(t.agents)
      .where(eq(t.agents.workspaceId, workspaceId))
      .orderBy(asc(t.agents.name));
    return rows.map(toAgent);
  }
}
```

- Returns domain objects / read models, never builders, `SQL`, or `tx`.
- No generic `BaseRepository<T>`; add methods per real use case.
- Workspace scoping is a parameter of every method (tenancy is never implicit).
- Port interface (in the application ring) only when needed:

```ts
// modules/agents/service.ts (application)
export interface AgentsStore {
  listForWorkspace(workspaceId: string): Promise<Agent[]>;
}
```

## Mappers

Keep `toAgent(row)` / `toAgentRow(input)` next to the repository (or in
`infrastructure/mappers.ts`). The http ring maps domain → DTO; when the domain type
*is* the shared contract (`Agent` from `@devdigest/shared`), one mapper suffices.

## Transactions (TransactionRunner port)

The use case owns the boundary; repositories don't open transactions.

```ts
// application
export interface TransactionRunner {
  run<T>(work: (repos: { agents: AgentsStore; versions: VersionsStore }) => Promise<T>): Promise<T>;
}

// infrastructure
export class DrizzleTransactionRunner implements TransactionRunner {
  constructor(private db: Db) {}
  run<T>(work) {
    return this.db.transaction((tx) =>
      work({ agents: new AgentsRepository(tx), versions: new VersionsRepository(tx) }));
  }
}
```

- A throw inside `work` rolls back; nested `tx.transaction` = savepoint.
- Keep only DB work inside the transaction — no LLM/GitHub calls while holding it.
- One aggregate per transaction where possible; reference others by id.

## pgvector and read models

- Similarity queries (`<=>`, `vector` columns) stay in the adapter; the port exposes
  `findSimilar(embedding, k)` returning domain/read-model objects.
- Read-heavy list screens may use a dedicated query method returning a DTO-shaped
  read model directly (CQRS-lite) — still in infrastructure, still called via a use case.

## Error translation

Catch driver errors in the repository and rethrow domain errors
(e.g. unique violation `23505` → `ValidationError('Agent name already exists')`).
The http ring must never see a Postgres error code.
