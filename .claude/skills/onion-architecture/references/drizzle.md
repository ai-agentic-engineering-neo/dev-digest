# Drizzle ORM + Postgres — the persistence adapter

"The database is not the center. It is external." — Palermo. Drizzle is an infrastructure detail
hidden behind repository ports.

## Rules

- **Single owner.** Only `modules/<name>/repository.ts` and `repository/<aggregate>.repo.ts` import
  `drizzle-orm`, `db/schema`, `db/client` (`Db`). This mirrors Bedstack's rule that the repository is
  the only layer allowed to touch the Drizzle instance and schema ([Bedstack](https://bedstack.js.org/docs/database)).
- **Port first.** Declare what the use case needs in `ports.ts` (intent-named methods), then
  `class XRepository implements XStore`. The service types its dependency as the port.
  Shared cross-module repos stay on the container (`agentsRepo`, `reviewRepo`) — new shared ones too.
- **Constructor takes `Db`.** `new XRepository(db)` happens **only** in `platform/container.ts`
  (lazy getter + `ContainerOverrides` entry) or in tests.
- **Map at the boundary.** Repositories return domain types or DTO-ready shapes. `$inferSelect` rows
  (`db/rows.ts`) do not cross into services. Postgres `snake_case` → Drizzle `camelCase` → contract
  `snake_case` conversions happen in mappers next to the repository (`helpers.ts` `toXDto`) —
  see [Fowler: Repository](https://www.martinfowler.com/eaaCatalog/repository.html) and
  [Stemmler: mappers](https://khalilstemmler.com/articles/tags/mapper-pattern).
- **Tenancy lives here.** Every query on a table with `workspace_id` filters
  `eq(t.x.workspaceId, workspaceId)`; child tables are reached through an already-checked parent.
  The `workspaceId` argument is explicit on every port method.
- **Transactions are infrastructure.** Open `db.transaction(async (tx) => …)` inside a repository
  method that represents one atomic intent (`createAgentWithVersion`). If a use case must span several
  repositories atomically, add a unit-of-work port:
  ```ts
  // ports.ts
  export interface UnitOfWork { run<T>(fn: (repos: TxRepos) => Promise<T>): Promise<T> }
  // repository.ts — implementation binds repos to `tx`
  ```
  The service never sees `tx` or Drizzle types ([Drizzle transactions](https://orm.drizzle.team/docs/transactions)).
- **JSON columns are an edge.** Parse `jsonb` values with the Zod contract when reading
  (`AgentVersionConfig.parse(row.config)`), so inner rings get typed data.
- **Schema & migrations** stay where they are (`db/schema/<domain>.ts`, generated migrations via
  `pnpm db:generate`, never hand-edited; pgvector via `pnpm db:migrate`).

## Anti-patterns

| Smell | Fix |
|---|---|
| `container.db.select()` in a service/route | Repository method behind a port |
| Service imports `AgentRow` | Return a domain type / DTO from the repository |
| `helpers.ts` imports `t.*` to build a `where` | Move the query builder into the repository |
| Repository decides business status (e.g. "stale") | Return raw facts, decide in `domain.ts` |
| Generic `BaseRepository<T>` with `findAll/update` | Intent-named methods on a small port |

## References
- [Drizzle — Transactions](https://orm.drizzle.team/docs/transactions)
- [Bedstack — Database & ORM](https://bedstack.js.org/docs/database)
- [Folionaut ADR 004 — Repository pattern over Drizzle (trade-offs)](https://spencerjireh.github.io/folionaut/decisions/004-repository-pattern)
- Tool-level detail: `.claude/skills/drizzle-orm-patterns/`, `.claude/skills/postgresql-table-design/`
