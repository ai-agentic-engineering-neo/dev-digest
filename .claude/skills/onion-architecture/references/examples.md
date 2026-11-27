# Examples — real refactors in this repo

These are the legacy patterns listed in SKILL.md §5 and the target shape. Use them as the
template for new code; migrate legacy files only when in scope.

## 1. Service locator → narrow ports (`modules/repos/service.ts`)

**Before (legacy):**
```ts
export class RepoService {
  private repo: RepoRepository;
  constructor(private container: Container) {          // whole world injected
    this.repo = new RepoRepository(container.db);       // infra built inside the core
  }
  async runCloneJob(p: CloneJobPayload) {
    const { path } = await this.container.git.clone(/* … */);
    await this.repo.updateClonePath(p.repoId, path);
    await this.container.jobs.enqueue(/* … */);
  }
}
```

**After:**
```ts
// types.ts (ring 2)
export interface JobQueue { enqueue(workspaceId: string, kind: string, payload: unknown): Promise<unknown> }
export interface RepoServiceDeps {
  repos: RepoRepositoryPort;
  git: Pick<GitClient, 'clone' | 'sync'>;
  jobs: JobQueue;
}

// service.ts (ring 3) — no Container, no db, no drizzle
export class RepoService {
  constructor(private deps: RepoServiceDeps) {}
  async runCloneJob(p: CloneJobPayload) {
    const { path } = await this.deps.git.clone(/* … */);
    await this.deps.repos.updateClonePath(p.repoId, path);
    await this.deps.jobs.enqueue(/* … */);
  }
}

// routes.ts (ring 4) — composition
const service = new RepoService({ repos: new RepoRepository(c.db), git: c.git, jobs: c.jobs });
```
Test: `new RepoService({ repos: fakeRepos, git: new MockGitClient(), jobs: { enqueue: vi.fn() } })` — no Docker, no container.

## 2. Queries in a route → repository + service (`modules/pulls/`)

**Before (starter):** the `GET /repos/:id/pulls` handler selected the repo with Drizzle,
called `container.github()`, looped over PRs inserting with `container.db.insert(...)`,
then re-read and mapped.

**Now (2026-11-27): done. This is the reference module.** `types.ts` holds the domain
types (`PullRepo`, `PullRecord`) and the ports (`PullsRepositoryPort`, `PullsLogger`,
`PullsServiceDeps`). `service.ts` takes `deps` and has no `Container`, Drizzle or Fastify
in it. `repository.ts implements PullsRepositoryPort`. `routes.ts` is the module's
composition root:
```ts
const service = new PullsService({
  pulls: new PullsRepository(container.db),
  github: () => container.github(),   // lazy factory: the token may be missing → service degrades
  log: app.log,                        // satisfies the PullsLogger port structurally
});
```

**Shape:**
```
modules/pulls/
├── types.ts        # ring 1–2 · PullRepo, PullRecord, PullsRepositoryPort, PullsLogger, PullsServiceDeps
├── constants.ts    # ring 1   · DIFF_STAT_BACKFILL_LIMIT
├── helpers.ts      # ring 1   · toPrMeta (pure mapping to the contract)
├── status.ts       # ring 1   · deriveReviewStatus
├── cost.ts         # ring 1   · latestRoundCost
├── service.ts      # ring 3   · load repo (port) → try sync from GitHub → upsert (port) → read (port)
├── repository.ts   # ring 4   · PullsRepository implements PullsRepositoryPort (Drizzle)
└── routes.ts       # ring 4   · schema + getContext + one service call; composes the service
```
The "local-first: never fail the read if GitHub is down" rule is business behaviour, so it
lives in `service.ts` (`githubOrNull`). The route doesn't catch anything.

## 3. Drizzle type in a pure helper (`modules/repos/helpers.ts`)

**Before:** `export function toRepoDto(row: typeof t.repos.$inferSelect): Repo` — imports `db/schema` into ring 1.

**After:** move the mapper into `repository.ts` (private `toRepo(row)`), and have the
repository return `Repo`. `helpers.ts` keeps only `parseRepoUrl`, `isValidRepoRef`,
`canonicalCloneUrl` — pure and DB-free.

## 4. Cross-module internals (`repos/service.ts` → `repo-intel/constants.js`)

**Before:** `import { INDEX_JOB_KIND } from '../repo-intel/constants.js'`

**After:** `import { INDEX_JOB_KIND } from '../repo-intel/index.js'` — the barrel is the
module's public API. Better still, depend on a port (`RepoIntel.enqueueIndex(repoId)`) so
`repos` doesn't need to know the job kind at all.

## 5. Folder shape for a new module

```
modules/<name>/
├── types.ts        ring 1–2 · domain types, XxxRepositoryPort, XxxServiceDeps
├── constants.ts    ring 1   · literals
├── helpers.ts      ring 1   · pure rules (unit-tested in server/test/)
├── service.ts      ring 3   · use cases; constructor(deps)
├── repository.ts   ring 4   · Drizzle, implements the port, maps rows → contracts
├── routes.ts       ring 4   · Fastify plugin; composes service; schema-validated handlers
└── index.ts        public API for other modules (types, constants, facade) — optional
```
