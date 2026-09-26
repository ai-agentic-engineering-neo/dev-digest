# Worked examples (real server code)

Each example is one small move that keeps `pnpm arch:check` green and shrinks
the baseline. Snippets are shortened; paths are real as of 2026-09-21.

## 1. CRUD route that queries Drizzle → route + repository

`modules/workspace/routes.ts` today:

```ts
app.get('/workspace', async (req) => {
  const { workspaceId } = await getContext(container, req);
  const repos = await container.db.select().from(t.repos)
    .where(eq(t.repos.workspaceId, workspaceId));
  return { workspaceId, cloneDir: container.config.cloneDir, repos: repos.map(/* row → DTO */) };
});
```

This is CRUD: one read, no rule. It does **not** need a service (SKILL §1). It
needs the query and the row mapping out of the route:

```ts
// modules/workspace/repository.ts
export class WorkspaceRepository {
  constructor(private db: Db) {}
  async listClonedRepos(workspaceId: string): Promise<WorkspaceRepoSummary[]> {
    const rows = await this.db.select().from(t.repos).where(eq(t.repos.workspaceId, workspaceId));
    return rows.map(toWorkspaceRepoSummary);
  }
}

// modules/workspace/routes.ts
const repo = new WorkspaceRepository(container.db);   // or container.workspaceRepo
app.get('/workspace', async (req) => {
  const { workspaceId } = await getContext(container, req);
  return { workspaceId, cloneDir: container.config.cloneDir, repos: await repo.listClonedRepos(workspaceId) };
});
```

Then `pnpm arch:baseline`: two `workspace/routes.ts` entries disappear.

The route may import its own module's repository (CRUD case); it may not
import `drizzle-orm` or `db/*`. Once a second rule or port appears, put a
service between them.

## 2. Non-atomic refresh in `GET /pulls/:id` → service + UnitOfWork

Today the route fetches from GitHub, then runs delete `pr_files` → insert →
delete `pr_commits` → insert → update `pull_requests` as five independent
statements. A failure after the first delete commits a PR with no files, and the
`catch` then serves that empty state as "persisted detail".

Target:

```ts
// modules/pulls/service.ts
export class PullsService {
  constructor(private deps: {
    pulls: Pick<PullsRepository, 'getWithRepo' | 'replaceFiles' | 'replaceCommits' | 'updateStats' | 'getPersistedDetail'>;
    github: () => Promise<GitHubClient>;
    uow: UnitOfWork;
    log: Logger;
  }) {}

  async detail(workspaceId: string, prId: string): Promise<PrDetail> {
    const { pr, repo } = await this.deps.pulls.getWithRepo(workspaceId, prId); // throws NotFoundError
    let detail: GitHubPrDetail;
    try {
      detail = await (await this.deps.github()).getPullRequest({ owner: repo.owner, name: repo.name }, pr.number);
    } catch (err) {
      this.deps.log.warn({ err }, 'GitHub refresh skipped; serving persisted detail');
      return this.deps.pulls.getPersistedDetail(pr.id);
    }
    await this.deps.uow.run(async (tx) => {                 // writes only, after the external call
      await this.deps.pulls.replaceFiles(pr.id, detail.files, tx);
      await this.deps.pulls.replaceCommits(pr.id, detail.commits, tx);
      await this.deps.pulls.updateStats(pr.id, detail, tx);
    });
    return { ...detail, id: pr.id };
  }
}
```

What changed, ring by ring: the route shrinks to schema + `getContext` +
`service.detail()`; the `try` now wraps **only** the external call, so a DB failure
surfaces as a 500 instead of being mistaken for "offline"; the writes are atomic.
Tests: a unit test with a fake `github` that throws (serves persisted) and one
that succeeds (all three repository calls get the same `tx`); one `.it.test.ts`
that makes `replaceCommits` fail and asserts `pr_files` is unchanged.

## 3. Service that takes `Container` → narrow `Deps`

`AgentsService` today:

```ts
constructor(private container: Container) {
  this.repo = new AgentsRepository(container.db);   // service constructs infrastructure
}
```

Move construction out and name what is used:

```ts
export interface AgentsDeps {
  agents: AgentsRepository;                          // or Pick<…> of the methods used
  llm: (p: Provider) => Promise<LLMProvider>;
}
export class AgentsService {
  constructor(private deps: AgentsDeps) {}
}

// routes.ts (or container.agentsDeps())
const service = new AgentsService({
  agents: app.container.agentsRepo,
  llm: (p) => app.container.llm(p),
});
```

Tests stop needing a container: `new AgentsService({ agents: fakeRepo, llm: async () => new MockLLMProvider() })`.
For `repo-intel/service.ts` the same move also removes the `container ↔ service`
cycle from the baseline.

## 4. Service importing `db/schema` → repository returns the domain type

`reviews/run-executor.ts` imports `* as schema from '../../db/schema.js'` to name
row/insert types. Replace each use with the contract type
(`Review`, `RunTrace`) or a repository-declared input type, and let
`ReviewRepository` map rows internally. Removes
`application-does-not-know-the-orm: run-executor.ts → db/schema.ts`.

## 5. Rule buried in SQL or a handler → pure function

The PR-list FINDINGS rollup is the good pattern already: the route/repository
fetches rows, and `pulls/status.ts` (`pickLatestReviewIds`,
`foldSeverityCounts`, `deriveReviewStatus`) decides. Copy that shape: when a
handler contains `if (review.kind === 'review' && …)` style branching, move the
branch into a named pure function beside it, test it with plain objects, and
leave the query where it is.

## 6. New external system → port first

Adding, say, a Slack notifier:

1. `vendor/shared/adapters.ts`: `export interface Notifier { send(msg: NotifyMessage): Promise<void> }`
   (it is contract-ring code: no SDK types in the signature).
2. `adapters/notifier/slack.ts`: `class SlackNotifier implements Notifier` — the
   only file importing the Slack SDK.
3. `adapters/mocks.ts`: `MockNotifier` recording calls.
4. `platform/container.ts`: lazy `notifier()` getter + `ContainerOverrides.notifier`.
5. The service receives `notifier` in its `Deps`.

If the port's method names mention Slack concepts (channels, blocks), the port
is shaped by the adapter instead of by the use case. Rename it.
