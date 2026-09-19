# Onion Architecture — examples

Every pair below is taken from `server/src`. The ❌ side is real code in this
repo unless marked *(constructed)*; where it is real it is listed in the skill's
**Known debt** section, which means "do not copy", not "go fix it now".

---

## 1. Persistence belongs to the repository

❌ `modules/pulls/routes.ts` — HTTP handler builds its own query. Nothing between
the URL and the SQL; the workspace scope is one forgotten `and()` away from a
cross-tenant read, and none of it is reachable from a job or a test without an
HTTP request.

```ts
export default async function pullsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const [repo] = await container.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, req.params.id)));
    if (!repo) throw new NotFoundError('Repo not found');
    // …GitHub sync + persistence, inline
  });
}
```

✅ `modules/agents/routes.ts` + `service.ts` + `repository.ts` — the same shape
split across three rings. The handler resolves context, validates through the
schema and calls one service method; the query lives in `repository.ts`, which
is the only file that imports `drizzle-orm` and `db/schema`.

```ts
// routes.ts  (L5 — HTTP only)
import { getContext } from '../_shared/context.js';
import { AgentsService } from './service.js';

const service = new AgentsService(app.container);

app.get('/agents', async (req) => {
  const { workspaceId } = await getContext(app.container, req);
  return service.list(workspaceId);
});

// service.ts  (L2 — orchestration, and the DTO mapping it delegates)
async list(workspaceId: string): Promise<Agent[]> {
  const rows = await this.repo.list(workspaceId);
  return rows.map(toAgentDto);
}

// repository.ts  (L3 — the only ring that knows Drizzle exists)
import { and, asc, eq } from 'drizzle-orm';
import * as t from '../../db/schema.js';
```

---

## 2. A service takes the container, not a concrete adapter

❌ *(constructed)* — the import pins the service to Octokit. `ContainerOverrides`
can no longer replace it, so every test of this service now needs a network or a
module mock.

```ts
import { OctokitGitHubClient } from '../../adapters/github/octokit.js';

export class ReposService {
  async sync(repoId: string) {
    const gh = new OctokitGitHubClient(process.env.GITHUB_TOKEN!);
    // …
  }
}
```

✅ `modules/agents/service.ts` — depends on the container, which resolves the
port. Secrets are looked up inside `container.github()`, so the service never
sees a key.

```ts
import type { Container } from '../../platform/container.js';

export class AgentsService {
  private repo: AgentsRepository;

  constructor(private container: Container) {
    this.repo = new AgentsRepository(container.db);
  }

  async listModels(provider: Provider): Promise<ModelInfo[]> {
    const llm = await this.container.llm(provider);
    return llm.listModels();
  }
}
```

Note the asymmetry, and keep it: the module's **own** repository is constructed
from `container.db` (it is this slice's code, and there is nothing to swap —
tests swap the database itself), while anything crossing the process boundary is
resolved *through* the container so a mock can take its place.

And the test seam this buys (`test/routes-smoke.test.ts`):

```ts
const app = await buildApp({
  config,
  overrides: { github: new MockGitHubClient({ login: 'octocat' }) },
});
const res = await app.inject({ method: 'POST', url: '/settings/test-connection', … });
```

---

## 3. Helpers are the functional core

❌ `modules/repos/helpers.ts` — the docblock says *"Pure functions only — no I/O,
no DB, no container"*, and line 2 imports the schema. Once a helper knows the
schema, its tests inherit the database.

```ts
import { type Repo } from '@devdigest/shared';
import * as t from '../../db/schema.js';   // ← the ring boundary, crossed
```

✅ `modules/pulls/status.ts` — values in, values out. Testable in
`test/pulls-status.test.ts` with no Docker and no mocks.

```ts
import type { PrStatus } from '@devdigest/shared';

export function rollupSeverities(rows: { severity: string }[]): SeverityCounts {
  const c: SeverityCounts = { critical: 0, warning: 0, suggestion: 0 };
  for (const r of rows) {
    if (r.severity === 'CRITICAL') c.critical += 1;
    else if (r.severity === 'WARNING') c.warning += 1;
    else if (r.severity === 'SUGGESTION') c.suggestion += 1;
  }
  return c;
}
```

Note the parameter type: `{ severity: string }[]`, not `FindingRow[]`. The
helper asks for the smallest shape it needs, so it does not care where the rows
came from.

---

## 4. Row types come from `db/rows.ts`, not through another module

❌ `modules/agents/helpers.ts` — takes its row types *through* the repository,
which imports `isConfigChange` back from the helper. That is a cycle, and it
makes a pure file depend on a data-access file.

```ts
import type { AgentRow, AgentVersionRow } from './repository.js';
```

✅ The one-line fix, and the convention for every new mapper:

```ts
import type { AgentRow, AgentVersionRow } from '../../db/rows.js';
```

`db/rows.ts` exists precisely for this — row shapes inferred once from the
schema, so a consumer never has to import another module's data layer.

---

## 5. Ports are written for the inside

❌ *(constructed)* — a port shaped like the SDK. Every consumer now has to know
Octokit's response envelope, and the mock has to fake it.

```ts
export interface GitHubClient {
  request(route: string, params: Record<string, unknown>): Promise<{ data: unknown }>;
}
```

✅ `vendor/shared/adapters.ts` — the port speaks the domain's language, which is
why `MockGitHubClient` in `adapters/mocks.ts` is a handful of plain methods
rather than an HTTP fixture.

```ts
export interface GitHubClient {
  listPulls(repo: RepoRef): Promise<PrMeta[]>;
  getPull(repo: RepoRef, number: number): Promise<PrDetail>;
  createReview(repo: RepoRef, payload: GitHubReviewPayload): Promise<void>;
}
```

---

## 6. The contract is the boundary, and the route does not parse by hand

❌ *(constructed)* — hand-rolled parsing skips response serialization, and
`instanceof z.ZodError` is unreliable here because zod can be loaded twice.

```ts
app.post('/agents', async (req, reply) => {
  const body = CreateAgentBody.parse(req.body);   // ← bypasses the type provider
  …
});
```

✅ `modules/agents/routes.ts` — the schema drives validation *and* serialization,
and the error envelope is produced centrally in `app.ts`.

```ts
const CreateAgentBody = z.object({
  name: z.string().min(1),
  provider: Provider,
  model: z.string().min(1),
  system_prompt: z.string().min(1),
  enabled: z.boolean().optional(),
});

app.post('/agents', { schema: { body: CreateAgentBody } }, async (req, reply) => {
  const { workspaceId, userId } = await getContext(app.container, req);
  const agent = await service.create(workspaceId, { …req.body }, userId);
  reply.status(201);
  return agent;
});
```

---

## 7. Errors are translated at the boundary

❌ *(constructed)* — a Postgres error code travels outward, so the caller has to
know what stores the data to handle a duplicate.

```ts
try {
  await db.insert(t.repos).values(row);
} catch (err) {
  if ((err as { code?: string }).code === '23505') throw err;  // caller decodes SQLSTATE
}
```

✅ `platform/errors.ts` gives the taxonomy; the repository or service raises from
it and the HTTP status follows automatically.

```ts
import { AppError, NotFoundError } from '../../platform/errors.js';

if (!repo) throw new NotFoundError('Repo not found');
throw new AppError('invalid_repo_url', `Could not parse owner/repo from '${url}'`, 400);
```

---

## 8. Tenancy is resolved once, at the edge

❌ *(constructed)* — a query on a child table with no `workspace_id` column of
its own and no join to its parent. It type-checks, it passes review, and it
reads every workspace's findings.

```ts
const rows = await container.db.select().from(t.findings).where(eq(t.findings.reviewId, id));
```

✅ Resolve the context first, then scope through the parent that carries the
column (`findings.review_id → reviews.workspace_id`):

```ts
const { workspaceId } = await getContext(container, req);

const rows = await db
  .select()
  .from(t.findings)
  .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
  .where(and(eq(t.reviews.workspaceId, workspaceId), eq(t.findings.reviewId, id)));
```

`server/INSIGHTS.md` (2026-09-17) lists which tables actually carry the column —
`CLAUDE.md`'s "every table" is not literally true.

---

## 9. Secrets have one door

❌ *(constructed)*

```ts
const key = process.env.OPENROUTER_API_KEY;      // banned outside platform/config.ts
```

✅ `container.secrets` is the only read chokepoint (`LocalSecretsProvider` reads
`~/.devdigest/secrets.json`, mode 0600), and cached clients are invalidated
explicitly after a write:

```ts
const key = await container.secrets.get('openrouter');
// …after storing a new key:
container.invalidateSecretCaches();
```

---

## 10. Modules do not reach into each other

❌ `modules/repos/service.ts` — imports constants from `repo-intel`. Harmless
today, and the reason it is listed as debt: it is the first step of two slices
growing into one.

```ts
import { INDEXER_VERSION, SUPPORTED_EXT } from '../repo-intel/constants.js';
```

✅ Cross-cutting entities come from the composition root, which is where
`AgentsRepository` and `ReviewRepository` are constructed exactly once
(`platform/container.ts`):

```ts
// container.ts — shared repositories for entities more than one module reads
get agentsRepo(): AgentsRepository { … }
get reviewRepo(): ReviewRepository { … }

// a consuming module reaches for THAT, never for ../agents/repository.js
const agent = await this.container.agentsRepo.get(workspaceId, agentId);
```

No module consumes these getters yet — the starter constructs its own repository
per slice, and the shared accessors exist for the lesson that needs a second
reader. When that moment comes, the accessor is the answer; a relative import
into another slice is not.

Shared *code* — not shared entities — goes to `modules/_shared/`
(`context.ts`, `schemas.ts`).

---

## 11. Proving a rule bites

Before trusting `pnpm arch`, check it fails when it should. Add one import, run,
revert:

```sh
cd server
printf "import { eq } from 'drizzle-orm';\n%s" "$(cat src/modules/agents/service.ts)" > /tmp/svc && cp /tmp/svc src/modules/agents/service.ts
pnpm arch
#   error orm-only-in-repository: src/modules/agents/service.ts → node_modules/…/drizzle-orm/index.cjs
git checkout src/modules/agents/service.ts
```

The failure mode this guards against is a config that reports success because it
cannot see anything — excluding `node_modules` from the graph silently disables
every rule about an npm package.
