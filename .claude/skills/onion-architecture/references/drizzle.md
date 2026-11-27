# Drizzle — persistence as an adapter

Drizzle and `db/schema` are ring 4. The core sees **ports** that speak in domain /
`@devdigest/shared` types.

## Port in, Drizzle out

```ts
// modules/repos/types.ts  (ring 2)
import type { Repo } from '@devdigest/shared';
export interface NewRepo { workspaceId: string; owner: string; name: string; fullName: string; createdBy: string }
export interface RepoRepositoryPort {
  findByFullName(workspaceId: string, fullName: string): Promise<Repo | undefined>;
  getById(workspaceId: string, id: string): Promise<Repo | undefined>;
  list(workspaceId: string): Promise<Repo[]>;
  insert(values: NewRepo): Promise<Repo>;
  updateClonePath(repoId: string, clonePath: string): Promise<void>;
}

// modules/repos/repository.ts  (ring 4)
import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { RepoRepositoryPort } from './types.js';

type RepoRow = typeof t.repos.$inferSelect;          // never exported past this file
const toRepo = (row: RepoRow): Repo => ({ id: row.id, workspace_id: row.workspaceId, /* … */ });

export class RepoRepository implements RepoRepositoryPort {
  constructor(private db: Db) {}
  async getById(workspaceId: string, id: string) {
    const [row] = await this.db.select().from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, id)));
    return row && toRepo(row);
  }
  // …
}
```

## Rules
- **Only `repository.ts` (and `db/*`) imports `drizzle-orm` or `db/schema`.** Services, helpers, types: never.
- **`$inferSelect` / `$inferInsert` stay private to the repository.** Return contract types (`Repo`, `PrMeta`, …) or module domain types. The row → DTO mapper lives next to the repository (in the file or a sibling `mapper.ts`), not in `helpers.ts`. *(Stemmler — Repository/DTO/Mapper)*
- **Tenancy is a repository invariant:** every query filters by `workspaceId`; methods without it (e.g. `workspaceIdFor`) document why.
- **Repositories have no business rules.** "Dedupe on add", "refuse if running", "compute status" → service or helper. A repository may enforce data integrity (unique, FK) and translate DB errors (unique violation → `AppError('conflict', …, 409)`).
- **No generic `BaseRepository<T>`** unless three modules need the same shape — prefer explicit methods named after use cases (`findByFullName`, not `findOne(where)`). Leaking a query builder through the port defeats the port.
- **Shared repositories** (`AgentsRepository`, `ReviewRepository`) are constructed in `platform/container.ts` and consumed through getters — not imported from another module's folder.
- **Schema changes:** edit `db/schema/`, run `pnpm db:generate`. Never edit `db/migrations/*`.

## Transactions (unit of work)
The **application service decides** what must be atomic; **infrastructure opens** the transaction.

```ts
// ring 2 — port
export interface ReviewUnitOfWork {
  run<T>(work: (repos: { reviews: ReviewRepositoryPort; runs: RunRepositoryPort }) => Promise<T>): Promise<T>;
}

// ring 4 — Drizzle implementation
export class DrizzleReviewUoW implements ReviewUnitOfWork {
  constructor(private db: Db) {}
  run<T>(work: (r: { reviews: ReviewRepositoryPort; runs: RunRepositoryPort }) => Promise<T>) {
    return this.db.transaction((tx) =>
      work({ reviews: new ReviewRepository(tx), runs: new RunRepository(tx) }));
  }
}
```

- Repositories accept `Db | Tx` in the constructor so the same class works inside and outside a transaction. `db/client.ts` exports only `Db` today — the first module that needs a UoW adds `export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]` there.
- For a single repository, a method that wraps `this.db.transaction` internally is fine (e.g. `replaceFindings(runId, findings)`).
- Never pass `tx` into a service or a helper. *(Drizzle — Transactions)*

## jsonb and vectors
- jsonb columns are a trust boundary for **old** data: parse them with the current contract schema when reading (see INSIGHTS: `RunStats.cost_usd` must stay `nullish` because older `run_traces` lack the key).
- pgvector similarity queries live in the repository; the port exposes `findSimilar(embedding, k)` with domain types, not SQL fragments.

## Testing
- Services: fake ports (in-memory arrays) — fast, no Docker.
- Repositories: `*.it.test.ts` with testcontainers Postgres; verify tenancy scoping and the row ↔ DTO mapping.
