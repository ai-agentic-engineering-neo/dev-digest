# Bad vs good: the real violations in this repository

Each entry is a baseline item (or a family of them) with the smallest fix.
The rule number refers to `SKILL.md`.

## 1. A route that queries Drizzle (rules 1, 2)

`modules/pulls/routes.ts`, also `settings`, `polling`, `workspace`.

```ts
// bad — routes.ts
const [repo] = await container.db.select().from(t.repos)
  .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, req.params.id)));
if (!repo) throw new NotFoundError('Repo not found');
const gh = await container.github();
for (const pr of await gh.listPullRequests(...)) await container.db.insert(t.pullRequests)...
```

```ts
// good — routes.ts
const service = new PullsService({ pulls: app.container.pullsRepo, reviews: app.container.reviewRepo,
  github: () => app.container.github(), log: app.log });
app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req) => {
  const { workspaceId } = await getContext(app.container, req);
  return service.listForRepo(workspaceId, req.params.id);
});

// good — service.ts: the sync-then-read policy, GitHub offline fallback, NotFoundError
// good — repository.ts: select repo, upsert pull_requests, list with rollups
```

## 2. A service holding the whole container (rule 3)

Every legacy service: `constructor(private container: Container) { this.repo = new AgentsRepository(container.db) }`.

```ts
// bad
export class AgentsService {
  constructor(private container: Container) { this.repo = new AgentsRepository(container.db); }
  async models(id) { const llm = await this.container.llm(agent.provider); ... }
}
```

```ts
// good — ports.ts
export interface AgentsDeps { repo: AgentsRepositoryPort; llm: (provider: Provider) => Promise<LLMProvider> }
// good — service.ts
export class AgentsService { constructor(private readonly deps: AgentsDeps) {} }
// good — routes.ts
const service = new AgentsService({ repo: app.container.agentsRepo, llm: (p) => app.container.llm(p) });
// good — test
const svc = new AgentsService({ repo: new InMemoryAgentsRepo(), llm: async () => new MockLLMProvider() });
```

## 3. Row types in a service or executor (rule 4)

`reviews/run-executor.ts` takes `typeof schema.repos.$inferSelect`; `reviews/service.ts` and `repos/helpers.ts` import `db/rows` or `db/schema`.

```ts
// bad — run-executor.ts
import * as schema from '../../db/schema.js';
async executeRuns(repo: typeof schema.repos.$inferSelect, ...)
```

```ts
// good — ports.ts declares what the executor actually reads
export interface RepoRef { id: string; owner: string; name: string; defaultBranch: string }
// good — repository.ts maps the row to RepoRef; run-executor.ts takes RepoRef
```

## 4. An adapter importing a module (rule 5)

`adapters/astgrep/index.ts` and `adapters/depgraph/index.ts` import `modules/repo-intel/constants.ts`.

```ts
// bad — adapters/astgrep/index.ts
import { MAX_SIGNATURE_CHARS, SUPPORTED_EXT } from '../../modules/repo-intel/constants.js';
```

```ts
// good — the constants describe the port's contract, so they move next to it
// modules/repo-intel/types.ts (ring 1) exports SUPPORTED_EXT, MAX_SIGNATURE_CHARS
// adapters/astgrep/index.ts imports from '../../modules/repo-intel/types.js'  ← still a module import!
```

That is still rule 5. The clean move: put the constants in
`vendor/shared/adapters.ts` next to `CodeIndex` (they are part of the
indexing contract), or, if they are truly adapter tuning knobs, inside the
adapter with the service passing overrides through the port method's options.

## 5. A module importing another module (rule 6)

`repos/service.ts` imports `repo-intel/constants.ts`.

```ts
// good — the value the repos service needs (index job kinds) becomes part of the
// RepoIntel facade (`container.repoIntel.jobKinds` or a method), injected through deps.
```

## 6. Parsing the body by hand (rule 9)

`reviews/routes.ts:32`: `const body = RunRequest.parse(req.body ?? {})`.

```ts
// good
app.post('/pulls/:id/runs', { schema: { params: IdParams, body: RunRequest.default({}) } }, async (req) => {
  const { workspaceId, userId } = await getContext(app.container, req);
  return service.startRuns(workspaceId, userId, req.params.id, req.body);
});
```

## 7. A repository that is not called one (rules 2, 3, 4)

`settings/feature-models.ts` reads `container.db` and a table. It *is* a
repository: rename to `settings/repository.ts`, declare `SettingsRepositoryPort`
in `settings/ports.ts`, and give `settings/routes.ts` a `SettingsService`.

## 8. A new driven adapter, done right (already the norm)

`SecretsProvider` → `adapters/secrets/local.ts` → `container.secrets` →
`MockSecretsProvider` in `adapters/mocks.ts` → `ContainerOverrides.secrets`.
Copy this chain for any new SDK or external system.
