# Drizzle 0.45 + Postgres — infrastructure

Drizzle is how we *store* things, not what our things *are*. It lives in `modules/<f>/infrastructure/`,
`src/db/**` and the composition root. For query/schema/migration techniques see skills
`drizzle-orm-patterns` and `postgresql-table-design`.

## 1. Port first, Drizzle second

Declare what the use case needs, in domain vocabulary, in `domain/ports.ts`:

```ts
// modules/agents/domain/ports.ts
import type { Agent, AgentId, AgentVersion, WorkspaceId } from './types.js';
export interface AgentsRepository {
  byId(ws: WorkspaceId, id: AgentId): Promise<Agent | null>;
  list(ws: WorkspaceId, filter?: { enabled?: boolean }): Promise<Agent[]>;
  insert(agent: NewAgent): Promise<Agent>;
  save(agent: Agent): Promise<void>;            // persists the state the use case decided
  appendVersion(v: AgentVersion): Promise<void>;
  delete(ws: WorkspaceId, id: AgentId): Promise<boolean>;
}
```

Rules for port design (Fowler's Repository: "a collection-like interface for domain objects"):
- Method names speak the domain (`byId`, `save`, `appendVersion`), not SQL (`selectWhere`, `upsertRow`).
- Inputs and outputs are domain types. No `AgentRow`, no `$inferSelect`, no `SQL`, no `PgTransaction`.
- Return `null` for "absent"; the **use case** decides whether that is an `AgentNotFound` error.
- Read-model queries for screens (joins, aggregates, pagination) may get their own port
  (`AgentsQueries`) returning view types — CQRS-lite — instead of bloating the repository.

## 2. Repository implements the port, mapper converts

```ts
// modules/agents/infrastructure/agents.repository.ts
import { and, eq } from 'drizzle-orm';
import * as t from '../../../db/schema.js';
import type { Db } from '../../../db/client.js';
import type { AgentsRepository } from '../domain/ports.js';
import { toAgent, toAgentInsert } from './mappers.js';

export class DrizzleAgentsRepository implements AgentsRepository {
  constructor(private readonly db: Db) {}           // the root Db or a tx — see §4
  async byId(ws, id) {
    const [row] = await this.db.select().from(t.agents)
      .where(and(eq(t.agents.workspaceId, ws), eq(t.agents.id, id)));
    return row ? toAgent(row) : null;
  }
  // …
}
```

```ts
// modules/agents/infrastructure/mappers.ts — the ONLY place that knows both shapes
export const toAgent = (row: AgentRow): Agent => ({ id: row.id as AgentId, provider: row.provider as Provider, … });
export const toAgentVersion = (row: AgentVersionRow): AgentVersion =>
  ({ …, config: AgentVersionConfig.parse(row.configJson) });   // jsonb parsed at the boundary
```

- `text` columns holding enums are narrowed in the mapper (today `as Provider` casts in
  `helpers.ts`); prefer a parse or an exhaustive check over a bare cast for data written by
  older code.
- `Date` stays `Date` in the domain; ISO strings are a presenter concern.

## 3. No business rules in repositories

Smell from today's code: `AgentsRepository.update` calls `isConfigChange` and decides to bump
the version and snapshot. That is a **domain policy**. Target:

```ts
// domain/policies.ts
export function applyAgentPatch(agent: Agent, patch: AgentPatch): { next: Agent; versionBumped: boolean } { … }
// application/agents.service.ts
const { next, versionBumped } = applyAgentPatch(current, patch);
await uow.run(async ({ agents }) => {
  await agents.save(next);
  if (versionBumped) await agents.appendVersion(snapshotOf(next));
});
```

A repository may still do *storage* decisions: `onConflictDoNothing`, cascades, `returning()`,
choosing indexes, batching.

## 4. Transactions: Unit of Work port over `db.transaction`

The use case owns the transaction boundary, but must not see Drizzle. Pattern (as in Sentry's
"atomic repositories" article, adapted so `tx` doesn't reach the use case):

```ts
// modules/_shared/domain/unit-of-work.ts  (inner)
export interface UnitOfWork<R> { run<T>(work: (repos: R) => Promise<T>): Promise<T>; }

// modules/agents/infrastructure/agents.uow.ts  (outer)
export class DrizzleAgentsUow implements UnitOfWork<{ agents: AgentsRepository }> {
  constructor(private readonly db: Db) {}
  run<T>(work: (r: { agents: AgentsRepository }) => Promise<T>) {
    return this.db.transaction((tx) => work({ agents: new DrizzleAgentsRepository(tx) }));
  }
}
```

- Repositories take `Db` in the constructor and the same class serves both paths: with
  drizzle-orm 0.45 the `tx` passed to `db.transaction` typechecks as our `Db`
  (`PostgresJsDatabase<typeof schema>`) — verified with `tsc` on 2026-11-24. No extra `Tx` type needed.
- There is no `db.transaction` anywhere in `server/src` today — the first UoW introduces it.
- Throwing inside `work` rolls back (Drizzle rolls back on a rejected callback). Don't call
  `tx.rollback()` from application code — throw a `DomainError`.
- Nested `uow.run` → Drizzle savepoints; avoid unless you need partial rollback.
- Single-statement use cases don't need a UoW; use the plain repository.
- Today's `AgentsRepository.insert` (insert + `snapshotVersion`) runs two writes **without** a
  transaction — exactly the bug class this pattern closes.

## 5. What stays where it is

- `src/db/schema/` keeps "tables for all milestones up front" (by design) — infrastructure.
- `src/db/rows.ts` row types are infrastructure; import them only in `infrastructure/`.
- Migrations: `pnpm db:generate` → `pnpm db:migrate` (not automatic) — unchanged.
- Shared repositories exposed on the container (`container.agentsRepo`, `container.reviewRepo`)
  become **port-typed** getters (`get agentsRepo(): AgentsRepository`), constructed with the
  Drizzle implementation.

## 6. Tests

| What | How | Suffix |
|---|---|---|
| Policies (`domain/`) | plain unit tests, no mocks | `*.test.ts` |
| Use cases (`application/`) | in-memory fakes of ports (`Map`-backed repository, fake UoW that just calls `work(repos)`) | `*.test.ts` |
| Drizzle repositories + mappers | real Postgres via Testcontainers (`test/helpers/pg.ts`) | `*.it.test.ts` (required when importing pg helpers) |

Under OrbStack, integration tests need `DOCKER_HOST=unix://$HOME/.orbstack/run/docker.sock TESTCONTAINERS_RYUK_DISABLED=true` (root INSIGHTS.md).
