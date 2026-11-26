# Onion Architecture — examples from this repo

Before/after pairs for the rules in [SKILL.md](SKILL.md). The "after" code is
live in `server/src/modules/repos/` and `server/src/modules/workspace/`; read
those modules for the full picture.

## 1. A query in a route → service + port

`routes-are-thin`. The route imported Drizzle and the schema, and built the
response itself.

```ts
// BEFORE — modules/workspace/routes.ts
import { eq } from 'drizzle-orm';
import * as t from '../../db/schema.js';

app.get('/workspace', async (req) => {
  const { workspaceId } = await getContext(container, req);
  const repos = await container.db.select().from(t.repos).where(eq(t.repos.workspaceId, workspaceId));
  return { workspaceId, cloneDir: container.config.cloneDir, repos: repos.map((r) => ({ /* … */ })) };
});
```

```ts
// AFTER — modules/workspace/ports.ts: the consumer declares what it needs
export interface RepoLister {
  list(workspaceId: string): Promise<Repo[]>;
}

// modules/workspace/service.ts: the use case, no HTTP and no SQL
export class WorkspaceService {
  constructor(private deps: { repos: RepoLister; cloneDir: string }) {}

  async overview(workspaceId: string): Promise<WorkspaceOverview> {
    const repos = await this.deps.repos.list(workspaceId);
    return { workspaceId, cloneDir: this.deps.cloneDir, repos: repos.map(/* … */) };
  }
}

// modules/workspace/routes.ts: wire once, then context → one call
export default async function workspaceRoutes(app: FastifyInstance) {
  const service = new WorkspaceService({
    repos: app.container.repoStore,
    cloneDir: app.container.config.cloneDir,
  });

  app.get('/workspace', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.overview(workspaceId);
  });
}
```

Two things to copy. The service receives `cloneDir: string`, not `AppConfig`.
And `workspace` reads the `repos` table without importing the repos module:
it declares `RepoLister`, and the container hands it the repos repository,
which fits structurally (example 5).

## 2. The container in a service → a `deps` object of ports

`core-no-infrastructure`, `core-uses-ports`.

```ts
// BEFORE — modules/repos/service.ts
import type { Container } from '../../platform/container.js';
import { RepoRepository } from './repository.js';

export class RepoService {
  private repo: RepoRepository;
  constructor(private container: Container) {
    this.repo = new RepoRepository(container.db);
  }
  async runCloneJob(payload: CloneJobPayload) {
    const { path } = await this.container.git.clone(/* … */);
    await this.repo.updateClonePath(payload.repoId, path);
  }
}
```

```ts
// AFTER — modules/repos/ports.ts
export interface RepoStore {
  findByFullName(workspaceId: string, fullName: string): Promise<Repo | undefined>;
  insert(values: NewRepo): Promise<Repo>;
  markCloned(repoId: string, clonePath: string): Promise<void>;
  // …
}
export interface JobQueue {
  register(kind: string, handler: (payload: unknown) => Promise<void>): void;
  enqueue(workspaceId: string, kind: string, payload: unknown): Promise<unknown>;
}
export type RepoCloner = Pick<GitClient, 'clone'>;

// modules/repos/service.ts
export interface RepoServiceDeps {
  repos: RepoStore;
  git: RepoCloner;
  jobs: JobQueue;
}
export class RepoService {
  constructor(private deps: RepoServiceDeps) {}
  async runCloneJob(payload: CloneJobPayload) {
    const { path } = await this.deps.git.clone(/* … */);
    await this.deps.repos.markCloned(payload.repoId, path);
  }
}

// modules/repos/routes.ts — the composition point
const service = new RepoService({
  repos: app.container.repoStore,
  git: app.container.git,
  jobs: app.container.jobs,
});
```

`JobRunner` and `SimpleGitClient` were not changed. They satisfy `JobQueue`
and `RepoCloner` structurally; the ports describe the two methods and the one
method the service calls.

## 3. A row type in a "pure" helper → the mapper moves into the repository

`core-no-infrastructure` on `helpers.ts -> db/schema.ts`. The file's own header
said "no I/O, no DB", and a type import had already broken that.

```ts
// BEFORE — modules/repos/helpers.ts
import * as t from '../../db/schema.js';
export function toRepoDto(row: typeof t.repos.$inferSelect): Repo { /* … */ }

// modules/repos/service.ts
const rows = await this.repo.list(workspaceId);
return rows.map(toRepoDto);
```

```ts
// AFTER — modules/repos/repository.ts: rows stop here
function toRepo(row: typeof t.repos.$inferSelect): Repo { /* … */ }

export class RepoRepository implements RepoStore {
  async list(workspaceId: string): Promise<Repo[]> {
    const rows = await this.db.select().from(t.repos).where(eq(t.repos.workspaceId, workspaceId));
    return rows.map(toRepo);
  }
}

// modules/repos/service.ts
return this.deps.repos.list(workspaceId);
```

`helpers.ts` became `domain.ts` and now holds only `parseRepoUrl`,
`canonicalCloneUrl` and `isValidRepoRef`.

## 4. A service unit test with in-memory ports

`server/test/repos-service.test.ts`. No database, no container, no
`vi.mock`, no reaching into private fields.

```ts
class InMemoryRepoStore implements RepoStore {
  rows: Repo[] = [];
  async findByFullName(workspaceId: string, fullName: string) {
    return this.rows.find((r) => r.workspace_id === workspaceId && r.full_name === fullName);
  }
  // …
}

const repos = new InMemoryRepoStore();
const enqueued: { kind: string }[] = [];
const service = new RepoService({
  repos,
  git: { clone: async () => ({ path: '/clones/acme/widgets' }) },
  jobs: { register: () => {}, enqueue: async (_ws, kind) => void enqueued.push({ kind }) },
});

const first = await service.add('ws-1', 'user-1', 'https://github.com/acme/widgets.git');
const second = await service.add('ws-1', 'user-1', 'git@github.com:acme/widgets.git');
expect(second.created).toBe(false);
expect(repos.rows).toHaveLength(1);
```

The repository itself is covered by the `*.it.test.ts` suite against a real
Postgres, and the HTTP surface by `buildApp({ overrides })` + `app.inject`.

## 5. Using another module

`no-cross-module-internals`. Two legal ways.

```ts
// Constants and types: through the other module's index.ts
import { INDEX_JOB_KIND, REFRESH_JOB_KIND } from '../repo-intel/index.js';   // OK
import { INDEX_JOB_KIND } from '../repo-intel/constants.js';                 // violation
```

```ts
// Behaviour or data: a port declared by the consumer, wired in the container
// modules/workspace/ports.ts
export interface RepoLister { list(workspaceId: string): Promise<Repo[]> }

// platform/container.ts — the composition root may name any concrete class
get repoStore(): RepoRepository {
  return (this._repoStore ??= new RepoRepository(this.db));
}
```

A module's `index.ts` exports types and constants only. It never re-exports
the service, the repository or the routes plugin.

## 6. A transaction: one repository method, named for the use case

```ts
// BAD — the port leaks the transaction; the service now knows Drizzle
interface PullStore {
  upsertPull(tx: Tx, pull: PullInput): Promise<string>;
  replaceFiles(tx: Tx, pullId: string, files: PrFile[]): Promise<void>;
}

// GOOD — ports.ts
interface PullStore {
  /** Upsert the pull and replace its files and commits, atomically. */
  saveSnapshot(snapshot: PullSnapshot): Promise<string>;
}

// repository.ts
async saveSnapshot(snapshot: PullSnapshot): Promise<string> {
  return this.db.transaction(async (tx) => {
    const [row] = await tx.insert(t.pullRequests).values(/* … */).onConflictDoUpdate(/* … */).returning();
    await tx.delete(t.prFiles).where(eq(t.prFiles.prId, row!.id));
    await tx.insert(t.prFiles).values(/* … */);
    return row!.id;
  });
}
```

The service fetches from GitHub first, then calls `saveSnapshot`. The
transaction never stays open across a network call.

## 7. An adapter that depends on a changeable secret

`container.github()` and `container.llm(id)` are async and re-resolve after
`invalidateSecretCaches()`. Inject the resolver, not an instance captured at
plugin registration.

```ts
// ports.ts
export type GitHubResolver = () => Promise<Pick<GitHubClient, 'listPullRequests'>>;

// routes.ts
const service = new PollingService({
  github: () => app.container.github(),
  pulls: app.container.reviewRepo,
});

// service.ts
const github = await this.deps.github();
```

## 8. A pure rule that needs the time

`domain-is-pure` cannot see `Date.now()`; the grep in SKILL.md can.

```ts
// BAD — domain.ts
export function isStale(updatedAt: Date): boolean {
  return Date.now() - updatedAt.getTime() > STALE_DAYS * DAY;
}

// GOOD — domain.ts: time is an argument, as in modules/pulls deriveReviewStatus
export function isStale(updatedAt: Date, now: number): boolean {
  return now - updatedAt.getTime() > STALE_DAYS * DAY;
}

// service.ts reads the clock and passes it in
const stale = isStale(pull.updatedAt, Date.now());
```
