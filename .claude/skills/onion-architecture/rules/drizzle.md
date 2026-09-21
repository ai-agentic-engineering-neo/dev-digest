# Drizzle — persistence is infrastructure

`db/schema*`, `db/rows.ts`, `$inferSelect`/`$inferInsert`, and every `eq/and/inArray/sql` call are **ring 4**.

## Rules

1. **Only repository files import `drizzle-orm` or `db/schema|rows`:** `modules/<m>/repository.ts`, `modules/<m>/repository/*.repo.ts`, `db/**`, `adapters/**`, the composition root. Enforced by `only-repository-touches-db` and `routes-no-persistence`.
2. **One repository per aggregate/module**, named by the domain (`getById`, `listForWorkspace`, `upsertPullRequest`) — not generic `select`/`query`. Repositories encapsulate joins, includes, upserts and "create-or-update" logic; callers never see a query builder.
3. **Return domain/DTO-ready types, not rows.** A repository method's signature must not mention `typeof t.x.$inferSelect`, `AgentRow`, `LinkedSkillRow`, etc. Map row → domain type **inside the repository** with a named mapper. (Today `repos/helpers.ts`, `reviews/{diff-loader,run-executor,service}.ts`, `agents/repository.ts` leak row types — tracked debt.)
4. **Where mappers live:** row → domain in the repository (needs the schema shape); domain → API DTO in the module's pure `helpers.ts` (`toRepoDto(domainRepo)`), taking a **domain** type, so helpers stay in ring 1.
5. **Repository contract lives inward.** Declare the interface in the module's `types.ts` (ring 2); `repository.ts` `implements` it. Services depend on the interface so unit tests can pass an in-memory fake.
6. **Workspace scoping is a repository invariant.** Every query takes `workspaceId`; never rely on the caller to filter.
7. **Transactions — the service owns the boundary, repositories join it.**
   - Drizzle: `db.transaction(async (tx) => { … })`; `tx.transaction()` gives savepoints; `tx.rollback()` for business-triggered rollback.
   - Repository methods take an optional last arg `tx?: DbOrTx` and use `(tx ?? this.db)`. Export the `DbOrTx` type once from `db/client.ts`.
   - A service needing atomicity across repositories asks a small `UnitOfWork`/`TransactionRunner` port (implemented in infra) rather than importing `Db`.
8. **Migrations stay in `db/migrations`** and are never edited once applied (`server/AGENTS.md`). Schema changes are infrastructure changes; a domain-type change is a separate, deliberate step in the mapper.
9. **No raw SQL in services or routes.** pgvector/similarity queries also live in repositories.
10. **Duplicate persistence code is a boundary smell.** The `pullRequests` upsert exists in both `pulls/routes.ts` and `polling/routes.ts` — one repository method, called from one service.

## Sketch

```ts
// modules/pulls/types.ts (ring 2)
export interface PullsRepo {
  getRepo(workspaceId: string, repoId: string): Promise<RepoRef | undefined>;
  upsertPullRequest(workspaceId: string, pr: PrMeta, tx?: DbOrTx): Promise<void>;
}

// modules/pulls/repository.ts (ring 4) — the only file importing drizzle + schema
export class PullsRepository implements PullsRepo {
  constructor(private db: Db) {}
  async upsertPullRequest(workspaceId: string, pr: PrMeta, tx?: DbOrTx) {
    await (tx ?? this.db).insert(t.pullRequests).values(toInsertRow(workspaceId, pr))
      .onConflictDoUpdate({ target: [...], set: toUpdateRow(pr) });
  }
}
```

## Sources

Drizzle [Transactions](https://orm.drizzle.team/docs/transactions) · Sentry, [Atomic Repositories in Clean Architecture and TypeScript](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/) (interface in app layer, optional `tx` through the call chain) · Khalil Stemmler, [DTOs, Mappers & the Repository Pattern](https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/) · Skill: `drizzle-orm-patterns` for syntax.
