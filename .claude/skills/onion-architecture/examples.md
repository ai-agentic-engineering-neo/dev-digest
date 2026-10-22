# Examples — DevDigest backend

## 1. ✅ Reference module — `modules/repos/`

| File | Ring | What it does |
|---|---|---|
| `routes.ts` | Presentation | Zod schema, `getContext`, one `service.*` call, status code |
| `service.ts` | Application | add / refresh / remove, clone job; talks to `container.git`, `container.secrets`, `container.jobs` |
| `repository.ts` | Infrastructure | the only file touching `repos`; every query scoped by `workspaceId` |
| `helpers.ts` | Domain | `parseRepoUrl`, `toRepoDto`, `withGitHubToken` — pure |
| `constants.ts` | Domain | job kinds, clone depth, secret name |

Copy this shape for new modules. (Its one legacy wart: `helpers.ts` imports `db/schema` for a row
type — prefer `import type { RepoRow } from './repository.js'`.)

## 2. ❌ → ✅ Drizzle in a route

```ts
// ❌ modules/pulls/routes.ts — presentation ring doing infrastructure work
app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req) => {
  const { workspaceId } = await getContext(container, req);
  const [repo] = await container.db
    .select().from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, req.params.id)));
  if (!repo) throw new NotFoundError('Repo not found');
  const gh = await container.github();
  // … sync, more queries, tallying, mapping …
});
```

```ts
// ✅ routes.ts — transport only
app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req) => {
  const { workspaceId } = await getContext(app.container, req);
  return service.listForRepo(workspaceId, req.params.id);
});

// ✅ service.ts — the use case
async listForRepo(workspaceId: string, repoId: string): Promise<PrMeta[]> {
  const repo = await this.repos.getById(workspaceId, repoId);
  if (!repo) throw new NotFoundError('Repo not found');
  await this.trySync(repo);                       // uses the GitHubClient port
  const rows = await this.pulls.listForRepo(workspaceId, repoId);
  const counts = tallySeverityCountsByPr(await this.pulls.findingsFor(rows));  // pure helper
  return rows.map((r) => toPrMeta(r, counts.get(r.id)));                      // pure helper
}

// ✅ repository.ts — Drizzle, business-named, tenant-scoped
async listForRepo(workspaceId: string, repoId: string) {
  return this.db.select().from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.repoId, repoId)))
    .orderBy(desc(t.pullRequests.updatedAt));
}
```

## 3. ❌ → ✅ SDK call in a service

```ts
// ❌ service imports the SDK — the core now depends on Octokit
import { Octokit } from 'octokit';
const gh = new Octokit({ auth: process.env.GITHUB_TOKEN });
const { data } = await gh.rest.pulls.list({ owner, repo });
```

```ts
// ✅ service depends on the port; the container picks the adapter (or a mock in tests)
const gh = await this.container.github();          // GitHubClient from @devdigest/shared
const prs = await gh.listPullRequests({ owner, name });
```

## 4. ❌ → ✅ Driver quirk leaking upward

```ts
// ❌ route returns Drizzle's numeric string → API sends "0.0027"
const [{ total }] = await container.db.select({ total: sum(t.agentRuns.costUsd) }).from(t.agentRuns);
return { totalCost: total };
```

```ts
// ✅ repository normalises; service and route only see numbers
async totalCost(workspaceId: string): Promise<number> {
  const [row] = await this.db.select({ total: sum(t.agentRuns.costUsd) }).from(t.agentRuns)
    .where(eq(t.agentRuns.workspaceId, workspaceId));
  return Number(row?.total ?? 0);
}
```

## 5. ✅ Testing a use case without Fastify or network

```ts
const app = await buildApp({
  config,
  overrides: { github: new MockGitHubClient({ login: 'octocat' }) },
});
// or, for a pure rule: import { deriveReviewStatus } from '../src/modules/pulls/status.js'
// and test it with plain inputs — no app, no DB.
```

Ring 1 code (helpers, status, reviewer-core) gets plain unit tests. Ring 3 is tested with mocked
ports. Ring 4 repositories get `*.it.test.ts` against real Postgres (testcontainers).

## 6. ✅ Transaction owned by the use case

```ts
// service.ts
async remove(workspaceId: string, id: string) {
  await this.repo.inTransaction(async (tx) => {
    await this.repo.removeJobs(id, tx);
    await this.repo.remove(workspaceId, id, tx);
  });
}
```

The service decides *what* is atomic; the repository owns *how* (`db.transaction`). See
[references/drizzle.md](references/drizzle.md).

## 7. ❌ → ✅ Reaching into another module

```ts
// ❌ modules/reviews/service.ts
import { AgentsRepository } from '../agents/repository.js';
const agents = new AgentsRepository(this.container.db);
```

```ts
// ✅ shared repository is wired once in the composition root
const agents = this.container.agentsRepo;
```

## 8. ❌ → ✅ Hidden time in a domain helper

```ts
// ❌ helpers.ts — not deterministic, hard to test
export const isStale = (polledAt: Date) => Date.now() - polledAt.getTime() > STALE_MS;

// ✅ caller passes "now"
export const isStale = (polledAt: Date, now: Date) => now.getTime() - polledAt.getTime() > STALE_MS;
```
