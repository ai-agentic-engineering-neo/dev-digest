# Onion Architecture — examples

Real snippets from this repo (trimmed), good and bad, plus the DI and
row-sharing patterns referenced in [SKILL.md](SKILL.md).

## Good: routes → service → repository (repo-intel)

`routes.ts` is Fastify-only — it resolves tenancy and delegates:

```ts
// server/src/modules/repo-intel/routes.ts
app.get(
  '/repos/:id/index-state',
  { schema: { params: IdParams } },
  async (req): Promise<IndexState> => {
    await getContext(container, req);
    return container.repoIntel.getIndexState(req.params.id);
  },
);
```

`service.ts` (`RepoIntelService`) owns orchestration and takes only the
`Container` in its constructor — no direct adapter imports:

```ts
// server/src/modules/repo-intel/service.ts
export class RepoIntelService implements RepoIntel {
  constructor(private container: Container) {}
  // ...delegates to this.repository (Drizzle) and container adapters
}
```

`repository.ts` is Drizzle-only, with typed row interfaces local to the
query shapes it needs:

```ts
// server/src/modules/repo-intel/repository.ts
export interface RepoBasics {
  id: string;
  owner: string;
  // ...
}
```

Same shape in `reviews/` and `agents/` — `routes.ts` never imports
`drizzle-orm` or `db/schema.js` in any of the three.

## Bad: DB access inline in a route handler (pulls — existing violation)

`pulls/routes.ts` imports the schema directly and runs Drizzle queries
inside the HTTP handler — this is the anti-pattern the skill flags, cited
here for recognition, not as a to-do:

```ts
// server/src/modules/pulls/routes.ts (current state)
import * as t from '../../db/schema.js';
// ...
app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req): Promise<PrMeta[]> => {
  const { workspaceId } = await getContext(container, req);
  const [repo] = await container.db
    .select()
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, req.params.id)));
  // ...20+ more inline `container.db.select/insert/update` calls follow,
  // including GitHub sync logic, diff-stat backfill, and cross-table
  // aggregation — all inside the route handler.
});
```

`polling/routes.ts`, `settings/routes.ts`, and `workspace/routes.ts` share
this shape. What a fix would look like (illustrative, not required by this
plan): extract `PullsService` (orchestration: GitHub sync, backfill policy)
and `PullsRepository` (the `t.repos`/`t.pullRequests`/`t.prFiles` queries),
leaving `routes.ts` to just resolve tenancy and call
`service.listForRepo(workspaceId, repoId)`.

## DTO mapping at the boundary (reviews/helpers.ts)

Drizzle rows are mapped to `@devdigest/shared`-shaped DTOs once, in a pure
helper — never leaked raw across a module boundary:

```ts
// server/src/modules/reviews/helpers.ts
export function findingRowToDto(row: FindingRow): ReviewDtoFinding {
  return {
    id: row.id,
    severity: row.severity as Finding['severity'],
    // ...
    review_id: row.reviewId,
    accepted_at: row.acceptedAt?.toISOString() ?? null,
    dismissed_at: row.dismissedAt?.toISOString() ?? null,
  };
}
```

## Row types centralized, not duplicated (db/rows.ts)

```ts
// server/src/db/rows.ts
/**
 * They live here — next to the schema — rather than inside a module's
 * `repository.ts`, so cross-cutting consumers (ci, eval, performance,
 * conformance, compose, hooks, runs, reviews) can reference a row shape
 * WITHOUT importing another module's data layer.
 */
export type FindingRow = typeof t.findings.$inferSelect;
export type PullRow = typeof t.pullRequests.$inferSelect;
export type AgentRunRow = typeof t.agentRuns.$inferSelect;
```

Each owning repository re-exports its row type from here rather than
redefining it.

## Composition root: shared repositories and adapters (platform/container.ts)

```ts
// server/src/platform/container.ts
export class Container {
  // Shared repositories for cross-cutting entities (agents, reviews/pulls,
  // runs). Constructed here, in the composition root, so consuming modules
  // use `container.agentsRepo` instead of reaching into another module's
  // folder.
  private _agentsRepo?: AgentsRepository;
  private _reviewRepo?: ReviewRepository;

  get agentsRepo(): AgentsRepository {
    return (this._agentsRepo ??= new AgentsRepository(this.db));
  }

  get reviewRepo(): ReviewRepository {
    return (this._reviewRepo ??= new ReviewRepository(this.db));
  }

  async github(): Promise<GitHubClient> {
    if (this.overrides.github) return this.overrides.github; // test override
    // ...lazily constructs OctokitGitHubClient from a secret
  }
}
```

Services receive dependencies through `container`, never `new` them
directly — this is what lets tests inject `ContainerOverrides` (mock LLM,
mock GitHub) and stay hermetic (see `TESTING.md`).

## Domain core with zero framework imports (reviewer-core/)

The one dependency the whole package has is an injected interface:

```ts
// reviewer-core/CLAUDE.md
// "Pure logic only — the only side effect is an injected `LLMProvider`,
//  which is what makes this mock-testable. Don't add DB/GitHub/FS calls here."
```

This is the onion's innermost ring taken to its logical conclusion: no
Fastify, no Drizzle, no filesystem — dependencies are inverted through a
single interface, and the package is consumed by `server/` as TypeScript
source via a tsconfig path alias.
