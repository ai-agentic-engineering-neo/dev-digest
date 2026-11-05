# Onion Architecture — examples from DevDigest

Bad snippets are real (abridged) code from `server/src`; good snippets show the target shape.
Rule numbers refer to `SKILL.md` § Hard rules.

## 1. Route doing data access (rules 1, 2)

**Bad** — `modules/pulls/routes.ts`: the route owns SQL, GitHub sync and status logic.

```ts
app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req): Promise<PrMeta[]> => {
  const { workspaceId } = await getContext(container, req);
  const [repo] = await container.db
    .select().from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, req.params.id)));
  if (!repo) throw new NotFoundError('Repo not found');
  const gh = await container.github();
  for (const pr of await gh.listPullRequests({ owner: repo.owner, name: repo.name })) {
    await container.db.insert(t.pullRequests).values({ /* … */ }).onConflictDoUpdate({ /* … */ });
  }
  // … more selects, mapping, deriveReviewStatus …
});
```

**Good** — route → service → repository port.

```ts
// modules/pulls/routes.ts  (presentation)
export default async function pullsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new PullsService(app.container);

  app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req): Promise<PrMeta[]> => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listForRepo(workspaceId, req.params.id);
  });
}

// modules/pulls/ports.ts  (core)
import type { PrMeta } from '@devdigest/shared';
import type { RepoRef, PullSnapshot, PullSummary } from './domain.js';

export interface PullsStore {
  findRepo(workspaceId: string, repoId: string): Promise<RepoRef | undefined>;
  upsertMany(workspaceId: string, repoId: string, pulls: PullSnapshot[]): Promise<void>;
  listSummaries(workspaceId: string, repoId: string): Promise<PullSummary[]>;
}

// modules/pulls/service.ts  (application)
type Deps = Pick<Container, 'pullsRepo' | 'github'>;

export class PullsService {
  constructor(private deps: Deps) {}

  async listForRepo(workspaceId: string, repoId: string): Promise<PrMeta[]> {
    const repo = await this.deps.pullsRepo.findRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    await this.syncBestEffort(workspaceId, repo);        // local-first: never fails the read
    const rows = await this.deps.pullsRepo.listSummaries(workspaceId, repo.id);
    const now = Date.now();
    return rows.map((r) => toPrMeta(r, deriveReviewStatus({ ...r, now })));  // pure domain rule
  }
}

// modules/pulls/repository.ts  (infrastructure) — the ONLY file importing drizzle + db/schema
export class PullsRepository implements PullsStore { /* select/insert with eq(t.x.workspaceId, …) */ }
```

`modules/pulls/status.ts` (`deriveReviewStatus`, `rollupSeverities`) is already a good **domain**
file: pure, no I/O, `now` injected. Move such code to `domain.ts` (or keep the role name) and test it
without Docker (`test/pulls-status.test.ts` does exactly that).

## 2. Service constructing its own repository (rule 3)

**Bad** — `modules/agents/service.ts`, `modules/reviews/service.ts` (see `server/INSIGHTS.md`):

```ts
constructor(private container: Container) {
  this.repo = new AgentsRepository(container.db);   // not swappable, service knows about db
}
```

**Good** — repository comes from the composition root, service gets only what it needs:

```ts
type Deps = Pick<Container, 'agentsRepo' | 'llm'>;
export class AgentsService {
  constructor(private deps: Deps) {}
}
// platform/container.ts already exposes `get agentsRepo()` with an override hook.
// Call site: new AgentsService(app.container) still type-checks — Container satisfies Pick<…>.
```

## 3. Application code importing concrete adapters (rule 4)

**Bad** — `modules/repo-intel/service.ts`:

```ts
import { extractEndpoints } from '../../adapters/codeindex/extract.js';
import { parseImports, parseSymbols, langForFile } from '../../adapters/astgrep/index.js';
```

**Good** — a port in the core, implementation in adapters, wiring in the container:

```ts
// modules/repo-intel/ports.ts
export interface SourceParser {
  langForFile(path: string): Lang | undefined;
  parseSymbols(lang: Lang, source: string): ParsedSymbol[];
  parseImports(lang: Lang, source: string): ParsedImport[];
}
// adapters/astgrep/index.ts
export class AstGrepSourceParser implements SourceParser { /* napi calls */ }
// platform/container.ts
get sourceParser(): SourceParser { return (this._sourceParser ??= this.overrides.sourceParser ?? new AstGrepSourceParser()); }
// adapters/mocks.ts
export class MockSourceParser implements SourceParser { /* fixtures */ }
```

Pure helpers that happen to live in `adapters/` (e.g. `adapters/git/diff-parser.ts` used by
`reviews/diff-loader.ts`) have no I/O — they belong in the core of the module that owns the concept
(or in `reviewer-core`), not in `adapters/`.

## 4. Persistence rows in application code (rules 2, 5)

**Bad** — `modules/reviews/service.ts`, `run-executor.ts`: `import type { AgentRow } from '../../db/rows.js'`
and `import * as schema from '../../db/schema.js'`.

**Good** — the repository maps `AgentRow` → a domain type (`ReviewAgent`) declared in `domain.ts`
or reuses the `Agent` DTO from `@devdigest/shared`; the executor never sees `schema.*`.

```ts
// modules/reviews/domain.ts
export interface ReviewAgent { id: string; provider: Provider; model: string; systemPrompt: string; strategy: ReviewStrategy }
// modules/reviews/repository/run.repo.ts
async listEnabledAgents(workspaceId: string): Promise<ReviewAgent[]> {
  const rows = await this.db.select().from(t.agents).where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.enabled, true)));
  return rows.map(toReviewAgent);       // mapping stays in infrastructure
}
```

## 5. Cross-module and adapter → module imports (rule 8)

**Bad** — `modules/repos/service.ts` imports `../repo-intel/constants.js`; `adapters/astgrep/index.ts`
and `adapters/depgraph/index.ts` import `modules/repo-intel/constants.js` (outer ring depending on a module).

**Good** — values the adapter needs are passed in (constructor options from the container), and other
modules reach repo-intel only through `container.repoIntel.*`. If a constant is truly shared, expose it
on the facade (`RepoIntel` interface) rather than importing the module's folder.

## 6. Pure domain rule (rule 5) — target shape

Today `agents/helpers.ts → isConfigChange(existing: Pick<AgentRow, …>, …)` types the rule over a
persistence row imported from `repository.ts` — that's why `helpers.ts ⇄ repository.ts` is circular.
Typing the rule over a domain/contract type removes both the cycle and the DB dependency:

```ts
// modules/agents/domain.ts — no imports except `import type`
import type { AgentVersionConfig } from '@devdigest/shared';

/** A config change bumps the version; cosmetic edits (name/description/enabled) don't. */
export function isConfigChange(prev: AgentVersionConfig, next: Partial<AgentVersionConfig>): boolean {
  return (Object.keys(next) as (keyof AgentVersionConfig)[]).some((k) => next[k] !== undefined && next[k] !== prev[k]);
}
```

## Known violations (baseline at skill creation, 2026-11-05)

There are 24 errors and 3 warnings, frozen as keys in `server/architecture-baseline.json` (that file
is the source of truth, this table explains it). Don't add to it. After fixing an entry, run
`node scripts/check-architecture.mjs --update` and update this table.

| Rule | From → To |
|---|---|
| routes-no-data-access | `pulls/routes.ts`, `polling/routes.ts`, `settings/routes.ts`, `workspace/routes.ts` → `drizzle-orm`, `db/schema` |
| application-no-drizzle | `settings/feature-models.ts` → `drizzle-orm`, `db/schema`; `reviews/run-executor.ts`, `reviews/diff-loader.ts`, `repos/helpers.ts` → `db/schema` |
| application-no-adapters | `reviews/diff-loader.ts` → `adapters/git/diff-parser`; `repo-intel/service.ts`, `repo-intel/pipeline/{full,incremental}.ts` → `adapters/{astgrep,codeindex/extract}`; `repo-intel/pipeline/repo-map.ts` → `adapters/tokenizer` |
| no-cross-module-imports | `repos/service.ts` → `repo-intel/constants.ts` |
| adapters-are-outer-ring | `adapters/astgrep/index.ts`, `adapters/depgraph/index.ts` → `modules/repo-intel/constants.ts` |
| application-no-db-rows (warn) | `reviews/service.ts`, `reviews/run-executor.ts` → `db/rows.ts` |
| no-circular (warn) | `agents/helpers.ts` ⇄ `agents/repository.ts` (helpers import row types from the repository) |
