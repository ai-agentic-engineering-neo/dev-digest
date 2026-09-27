---
name: drizzle-persistence
description: Drizzle repositories as driven adapters — row types stay inside, transactions belong to the use case
metadata:
  tags: drizzle, postgres, repository, persistence, driven-adapter, transactions
---

# Drizzle as a driven adapter

Drizzle is a typed query builder, which makes it a good fit for a repository: the
repository owns the SQL, and nothing above it knows SQL exists.

## Drizzle imports live in exactly one kind of file

`drizzle-orm`, `src/db/schema.js` and `src/db/client.js` may be imported by
`modules/*/repository.ts` (or `modules/*/repository/*.repo.ts`) and by `src/db/**`.
Nowhere else — not routes, not services, not the domain.

## Row types do not cross the repository boundary

`typeof t.agents.$inferSelect` is a description of a table, not of the business. The
moment it appears in a service signature, every consumer is coupled to the column
layout, and a migration becomes a refactor across layers.

```ts
// BAD — persistence type in an application-layer signature
async resolveTargets(workspaceId: string, opts: Opts): Promise<AgentRow[]>
```

```ts
// GOOD — the repository maps at its own edge
// repository.ts
async listEnabled(workspaceId: string): Promise<Agent[]> {
  const rows = await this.db.select().from(t.agents)
    .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.enabled, true)));
  return rows.map(toAgent);
}

// service.ts
async resolveTargets(workspaceId: string, opts: Opts): Promise<Agent[]>
```

The mapper (`toAgent`) is a pure function; it belongs in the repository folder or in
`helpers.ts`, never in the domain.

`src/db/rows.ts` exists so cross-cutting consumers can name a row shape without
importing another module's data layer. That is a persistence convenience — it does not
license a row type in an application signature.

## Every repository has a port

The port is an interface owned by the inside and named after what the use case needs:

```ts
// vendor/shared/adapters.ts (or the module's ports.ts)
export interface ReviewRepositoryPort {
  listRunsForPull(workspaceId: string, prId: string): Promise<ReviewRun[]>;
  activeRunsForPull(workspaceId: string, prId: string): Promise<ReviewRun[]>;
  insertRun(run: NewReviewRun): Promise<ReviewRun>;
}

// modules/reviews/repository.ts
export class DrizzleReviewRepository implements ReviewRepositoryPort { /* ... */ }
```

Method names describe data operations (`insertRun`, `listRunsForPull`), never use cases
(`runReview`). A repository that grows a verb from the domain has absorbed a rule that
belongs one ring inward.

## Transactions are a use-case decision

A transaction spans one unit of work, and the use case is what knows where it starts
and ends. Expose it as a port operation that takes a callback, so the service decides
the boundary without importing `db.transaction`:

```ts
await this.uow.run(async (repos) => {
  const run = await repos.reviews.insertRun(newRun);
  await repos.findings.insertMany(run.id, kept);
});
```

Never open a transaction inside a single repository method and call it a boundary, and
never leak the Drizzle transaction handle above the adapter.

## Queries, indexes and pgvector are invisible upward

Which index serves a query, whether a column is `jsonb`, whether similarity uses
pgvector — all of it is adapter detail. A read model that needs N extra queries (the PR
list is one) stays inside the repository; the service asks for the read model, not for
the queries.

## Migrations

Schema and migrations are infrastructure. A schema change means a new generated
migration (`pnpm db:generate`), never an edit to an applied file, and never a reason to
change a domain type "to match the table" — the mapping direction is table → domain.
