# Worked examples

Real refactors from this repository, done on 2026-09-21. The "before" blocks are how the
code looked; the "after" blocks are what is on disk now. Read them as the shape to
reproduce, not as work still outstanding.

## 1. A route that owns the query and the wire shape

### Before — `server/src/modules/workspace/routes.ts`

```ts
import { eq } from 'drizzle-orm';
import * as t from '../../db/schema.js';

export default async function workspaceRoutes(app: FastifyInstance) {
  const { container } = app;

  app.get('/workspace', async (req) => {
    const { workspaceId } = await getContext(container, req);
    const repos = await container.db
      .select()
      .from(t.repos)
      .where(eq(t.repos.workspaceId, workspaceId));
    return {
      workspaceId,
      cloneDir: container.config.cloneDir,
      repos: repos.map((r) => ({
        id: r.id,
        full_name: r.fullName,
        clone_path: r.clonePath,
        last_polled_at: r.lastPolledAt?.toISOString() ?? null,
        cloned: Boolean(r.clonePath),
      })),
    };
  });
}
```

Three rings in one function: the SQL (adapter), "a repo counts as cloned when it has a
clone path" (domain), and the snake_case wire mapping (transport).

### After

```ts
// modules/workspace/repository.ts — driven adapter
export class DrizzleWorkspaceRepository implements WorkspaceRepositoryPort {
  constructor(private readonly db: Db) {}

  async listRepos(workspaceId: string): Promise<WorkspaceRepo[]> {
    const rows = await this.db.select().from(t.repos)
      .where(eq(t.repos.workspaceId, workspaceId));
    return rows.map(toWorkspaceRepo);
  }
}
```

```ts
// modules/workspace/service.ts — use case
export class WorkspaceService {
  constructor(
    private readonly repos: WorkspaceRepositoryPort,
    private readonly cloneDir: string,
  ) {}

  async overview(workspaceId: string): Promise<WorkspaceOverview> {
    return { workspaceId, cloneDir: this.cloneDir, repos: await this.repos.listRepos(workspaceId) };
  }
}
```

```ts
// modules/workspace/helpers.ts — pure mapping, domain → wire
export const workspaceToDto = (o: WorkspaceOverview) => ({
  workspaceId: o.workspaceId,
  cloneDir: o.cloneDir,
  repos: o.repos.map((r) => ({
    id: r.id,
    full_name: r.fullName,
    clone_path: r.clonePath,
    last_polled_at: r.lastPolledAt?.toISOString() ?? null,
    cloned: r.isCloned,
  })),
});
```

```ts
// modules/workspace/routes.ts — driving adapter, one call
export default async function workspaceRoutes(app: FastifyInstance) {
  const service = app.container.workspaceService;

  app.get('/workspace', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return workspaceToDto(await service.overview(workspaceId));
  });
}
```

`isCloned` moved into the domain type, so the rule is stated once and is testable
without Postgres.

## 2. A route that orchestrates an import

`server/src/modules/pulls/routes.ts` does more: it reads a repo, resolves a GitHub
client, tolerates its absence, upserts every PR, then derives review status and a
findings summary. That is a use case with a fallback policy, written at the transport
layer.

The split, without repeating the body:

| Concern in the route today | Ring | Destination |
|---|---|---|
| `select ... from repos where id = ?` | adapter | `RepoRepositoryPort.findById` |
| `container.github()` failing → serve persisted PRs | application | `PullsService.listForRepo` |
| `insert into pull_requests ... on conflict` | adapter | `PullsRepositoryPort.upsertMany` |
| `deriveReviewStatus`, `scoreForFindings` | domain | already pure — keep, move under `domain/` |
| snake_case `PrMeta` shaping | transport | `helpers.ts` |

"Never fail the read — already-imported PRs stay viewable offline" is a business policy
and belongs in the service, where it can be asserted with a stubbed GitHub port.

## 3. Container in a constructor → named ports

### Before — `server/src/modules/reviews/service.ts`

```ts
export class ReviewService {
  constructor(private container: Container) {
    this.repo = new ReviewRepository(container.db);
    this.agents = container.agentsRepo;
    this.executor = new ReviewRunExecutor(container, this.repo, this.agents);
  }

  async resolveTargets(workspaceId: string, opts: Opts): Promise<AgentRow[]> { /* ... */ }
}
```

Two violations: the whole container is the dependency, and `AgentRow`
(`typeof agents.$inferSelect`) is persistence in an application signature.

### After

```ts
export class ReviewService {
  constructor(
    private readonly reviews: ReviewRepositoryPort,
    private readonly agents: AgentsRepositoryPort,
    private readonly executor: ReviewRunExecutorPort,
  ) {}

  async resolveTargets(workspaceId: string, opts: Opts): Promise<Agent[]> { /* ... */ }
}
```

```ts
// platform/container.ts — the only place that constructs
get reviewService(): ReviewService {
  return (this._reviewService ??= new ReviewService(
    this.reviewRepo,
    this.agentsRepo,
    this.reviewExecutor,
  ));
}
```

The unit test drops from "build a container with overrides" to "hand it three fakes".

## Migration order

Done, in this order, on 2026-09-21. Kept as the recipe for the next package.

| Phase | Work | Outcome |
|---|---|---|
| 0 | write the skill | 12 files under `.claude/skills/onion-architecture/` |
| 1 | `.dependency-cruiser.cjs` at `warn` + `arch:check` + CI step | baseline measured: 27 violations |
| 2 | lift `polling`, `pulls`, `settings`, `workspace` onto service + repository | 27 → 17 |
| 3 | replace `Container` constructor params with consumer-declared ports | cycles gone |
| 4 | `resolveTargets` made private; row types out of transport | `RepoRef` replaces two `$inferSelect` params |
| 5 | all ten rules flipped to `error` | 0 violations, 157 modules |

The order mattered. Phase 3 was only obvious after Phase 2: the ports each service needed
could not be named while routes were still bypassing the services entirely. And the
repo-intel cycle (`service.ts → container.ts → service.ts`) did not disappear by moving
code — it disappeared the moment the module declared `RepoIntelDeps` and stopped importing
the composition root at all.

## 4. Consumer-declared ports, in practice

The pattern that carried Phases 2–3. The consumer writes the interface describing only
the slice it needs; the concrete class satisfies it structurally, with no import either
way and no registration step:

```ts
// modules/workspace/service.ts — the consumer states its need
export interface WorkspaceRepoReader {
  list(workspaceId: string): Promise<
    { id: string; fullName: string; clonePath: string | null; lastPolledAt: Date | null }[]
  >;
}
```

`RepoRepository.list` returns rows with more fields than that, which TypeScript accepts.
`polling` does the same with `PollingPullWriter` (one method), `pulls` with
`PullsRepoReader` (two), and `repo-intel` with `RepoIntelDeps` (seven capabilities the
`Container` happens to have).

This is what keeps `no-cross-module-internals` satisfiable: `workspace` never imports
`repos/repository.ts`, it just describes the two fields it reads.
