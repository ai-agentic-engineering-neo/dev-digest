# Examples — good/bad from this repo

Snippets are trimmed from the real code (2026-09-19). "Before" ones are tracked in `.dependency-cruiser-known-violations.json` and get fixed in the refactor phases.

## 1. Route does persistence (BAD → GOOD)

**Bad** — `modules/pulls/routes.ts` (violates `routes-no-persistence`; also duplicated in `polling/routes.ts`):

```ts
import { and, desc, eq, inArray } from 'drizzle-orm';
import * as t from '../../db/schema.js';

app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req) => {
  const { workspaceId } = await getContext(container, req);
  const [repo] = await container.db.select().from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, req.params.id)));
  if (!repo) throw new NotFoundError('Repo not found');
  const gh = await container.github().catch(() => null);          // degrade decision in the route
  for (const pr of await gh.listPullRequests(...))
    await container.db.insert(t.pullRequests).values({ … });      // upsert copy #1 (polling has #2)
  // …aggregation of runs/findings per PR, also in the route
});
```

**Good** — same endpoint after Phase 1:

```ts
// pulls/routes.ts  (ring 4, edge)
app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req) => {
  const { workspaceId } = await getContext(app.container, req);
  return service.listPullRequests(workspaceId, req.params.id);
});

// pulls/service.ts  (ring 3) — no fastify, no drizzle
async listPullRequests(workspaceId: string, repoId: string): Promise<PrMeta[]> {
  const repo = await this.deps.repo.getRepo(workspaceId, repoId);
  if (!repo) throw new NotFoundError('Repo not found');
  const gh = await this.deps.github().catch((err) => { this.deps.log.warn({ err }, 'GitHub unavailable; serving persisted PRs'); return null; });
  if (gh) await this.syncFromGitHub(workspaceId, repo, gh);       // uses repo.upsertPullRequest (single copy)
  return this.deps.repo.listWithRunSummary(workspaceId, repoId);
}

// pulls/repository.ts (ring 4) — the only file importing drizzle + schema
```

## 2. ORM row type leaks inward (BAD → GOOD)

**Bad** — `modules/repos/helpers.ts` (`inner-no-outer`: a ring-1 file depends on the schema):

```ts
import * as t from '../../db/schema.js';
export function toRepoDto(row: typeof t.repos.$inferSelect): Repo { … }
```

**Good** — repository maps row → domain; the helper maps domain → DTO:

```ts
// repos/types.ts (ring 2)
export interface RepoRecord { id: string; workspaceId: string; owner: string; name: string;
  fullName: string; defaultBranch: string; clonePath: string | null; lastPolledAt: Date | null; createdBy: string | null }

// repos/repository.ts (ring 4)
private toRecord(row: typeof t.repos.$inferSelect): RepoRecord { return { id: row.id, … }; }
async getById(ws: string, id: string): Promise<RepoRecord | undefined> { … return row && this.toRecord(row); }

// repos/helpers.ts (ring 1, pure)
export function toRepoDto(r: RepoRecord): Repo { return { id: r.id, full_name: r.fullName, last_polled_at: r.lastPolledAt?.toISOString() ?? null, … }; }
```

## 3. Whole `Container` vs explicit `Deps` (BAD → GOOD)

**Bad** — `modules/agents/service.ts` (`inner-no-container`; service builds its own repository):

```ts
import type { Container } from '../../platform/container.js';
constructor(private container: Container) { this.repo = new AgentsRepository(container.db); }
```

**Good**:

```ts
export interface AgentsServiceDeps { repo: AgentsRepo; llm: (id: Provider) => Promise<LLMProvider> }
export class AgentsService { constructor(private deps: AgentsServiceDeps) {} }

// routes plugin (edge) or Container assembles it
const service = new AgentsService({ repo: app.container.agentsRepo, llm: (id) => app.container.llm(id) });
```

Unit test — no Fastify, no DB:

```ts
const svc = new AgentsService({ repo: new InMemoryAgentsRepo(), llm: async () => mockLlm });
```

## 4. Adapter reaching into a feature module (BAD → GOOD)

**Bad** — `adapters/astgrep/index.ts` imports `../../modules/repo-intel/constants.js` (`adapters-no-modules`).

**Good** — move the shared constants to `adapters/astgrep/constants.ts` (or `vendor/shared`) and have `repo-intel/constants.ts` re-export/import from there, so the arrow points edge → inner, never inner ← edge.

## 5. Application service imports a concrete adapter (BAD → GOOD)

**Bad** — `repo-intel/pipeline/full.ts` → `adapters/astgrep/index.ts` (`inner-no-outer`).

**Good** — a port in `repo-intel/types.ts`:

```ts
export interface AstIndexer { extractSymbols(path: string, source: string): Promise<CodeSymbol[]> }
```

`AstGrepIndexer implements AstIndexer` in `adapters/astgrep`; the Container injects it into `RepoIntelService` deps; `pipeline/*` receive `{ ast, tokenizer, repo }` — never the Container.

## 6. Good as-is (keep)

- `agents/` and `repos/` file layout: `routes.ts` → `service.ts` → `repository.ts` + pure `helpers.ts`/`constants.ts`.
- `vendor/shared/adapters.ts` ports + `adapters/mocks.ts` + `ContainerOverrides`.
- `reviews/run-executor.ts` structural `Logger` type (no Fastify logger in the service).
- `repo-intel/types.ts` `RepoIntel` facade port, injectable via `overrides.repoIntel`.
- `reviewer-core` receiving only an injected `LLMProvider`.
