# Examples — onion-architecture

Bad → good pairs for the rules in [SKILL.md](SKILL.md). Code is shortened to the part that matters.
"Bad" snippets are taken from real DevDigest code (2026-11) and are listed in SKILL.md §14.

---

## 1. Drizzle in a route → route + service + repository (§6, §8)

**Bad** (`server/src/modules/pulls/routes.ts`): the handler queries Postgres, aggregates, and maps rows.

```ts
import { and, eq, inArray, sql } from 'drizzle-orm';
import * as t from '../../db/schema.js';

app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req): Promise<PrMeta[]> => {
  const { workspaceId } = await getContext(container, req);
  // … 100+ lines: select repo, sync GitHub, backfill, latest review per PR …
  const costRows = await container.db
    .select({ prId: t.agentRuns.prId, total: sql<number | null>`sum(${t.agentRuns.costUsd})` })
    .from(t.agentRuns)
    .where(and(inArray(t.agentRuns.prId, prIds), eq(t.agentRuns.workspaceId, workspaceId)))
    .groupBy(t.agentRuns.prId);
  return rows.map((r) => ({ id: r.id, number: r.number, /* … */ cost_usd: costByPr.get(r.id) ?? null }));
});
```

**Good**: each layer does one job.

```ts
// modules/pulls/routes.ts: presentation + module composition root
export default async function pullsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new PullsService({
    pulls: new PullsRepository(container.db),
    github: container.github,
  });

  app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req): Promise<PrMeta[]> => {
    const ctx = await getContext(container, req);
    return service.listForRepo(ctx, req.params.id);
  });
}
```

```ts
// modules/pulls/ports.ts: application, feature-only port
import type { PrMeta } from '@devdigest/shared';

export interface PullsStore {
  listForRepo(workspaceId: string, repoId: string): Promise<PrMeta[]>;
  sumCostByPr(workspaceId: string, prIds: string[]): Promise<Map<string, number | null>>;
}
```

```ts
// modules/pulls/service.ts: application, no Drizzle, no Fastify
import type { GitHubClient, PrMeta } from '@devdigest/shared';
import type { RequestContext } from '../_shared/context.js';
import type { PullsStore } from './ports.js';
import { deriveReviewStatus } from './status.js'; // domain

export interface PullsServiceDeps {
  pulls: PullsStore;
  github: GitHubClient;
}

export class PullsService {
  constructor(private readonly deps: PullsServiceDeps) {}

  async listForRepo(ctx: RequestContext, repoId: string): Promise<PrMeta[]> {
    const pulls = await this.deps.pulls.listForRepo(ctx.workspaceId, repoId);
    const cost = await this.deps.pulls.sumCostByPr(ctx.workspaceId, pulls.map((p) => p.id));
    return pulls.map((p) => ({ ...p, cost_usd: cost.get(p.id) ?? null }));
  }
}
```

```ts
// modules/pulls/repository.ts: infrastructure, the only file that sees rows
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { PrMeta } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import type { PullRow } from '../../db/rows.js';
import * as t from '../../db/schema.js';
import type { PullsStore } from './ports.js';

export class PullsRepository implements PullsStore {
  constructor(private readonly db: Db) {}

  async sumCostByPr(workspaceId: string, prIds: string[]) {
    const out = new Map<string, number | null>();
    if (prIds.length === 0) return out;
    const rows = await this.db
      .select({
        prId: t.agentRuns.prId,
        total: sql<number | null>`sum(${t.agentRuns.costUsd})`.mapWith((v) => (v == null ? null : Number(v))),
      })
      .from(t.agentRuns)
      .where(and(inArray(t.agentRuns.prId, prIds), eq(t.agentRuns.workspaceId, workspaceId)))
      .groupBy(t.agentRuns.prId);
    for (const r of rows) if (r.prId) out.set(r.prId, r.total);
    return out;
  }

  // listForRepo(...) selects PullRow[] and maps each with toPrMeta()
}

/** Row → contract mapping lives at the repository boundary. */
function toPrMeta(r: PullRow): PrMeta {
  return { id: r.id, number: r.number, title: r.title, /* … */ opened_at: r.openedAt?.toISOString() ?? null };
}
```

---

## 2. Service locator → explicit deps (§10)

**Bad** (`server/src/modules/reviews/service.ts`):

```ts
export class ReviewService {
  constructor(private container: Container) {
    this.repo = new ReviewRepository(container.db); // builds its own infrastructure
    this.agents = container.agentsRepo;
  }
  // later: this.container.github, this.container.llm(...), this.container.runBus …
}
```

You can't tell what it depends on without reading every method, and a unit test needs a whole container.

**Good**:

```ts
export interface ReviewServiceDeps {
  reviews: ReviewStore;          // feature port
  agents: AgentCatalog;          // app-wide port (src/application/ports/agent-catalog.ts)
  llm: (provider: Provider) => Promise<LLMProvider>;
  events: RunEventSink;          // publish RunEvents, transport-agnostic
}

export class ReviewService {
  constructor(private readonly deps: ReviewServiceDeps) {}
}
```

Wiring stays in the composition root (module plugin body or `platform/container.ts`).

---

## 3. Row types leaking into application (§7, §8)

**Bad**:

```ts
// service.ts
import type { AgentRow } from '../../db/rows.js';
function pickModel(agent: AgentRow) { return agent.model; }
```

**Good**: the repository returns the contract type, and the service uses it as a type only.

```ts
// service.ts
import type { Agent } from '@devdigest/shared';
function pickModel(agent: Agent) { return agent.model; }
```

No parallel `AgentEntity` type: the contract already describes it.

---

## 4. Domain stays pure (§2, §7)

**Bad**: a domain rule parses with runtime Zod and reads the clock.

```ts
// domain.ts
import { z } from 'zod';
import { PrStatusSchema } from '@devdigest/shared';
export function isStale(input: unknown) {
  const s = PrStatusSchema.parse(input);   // parsing belongs to the boundary
  return Date.now() - s.updatedAt > 7 * DAY; // hidden input: the clock
}
```

**Good** (like `modules/pulls/status.ts`): typed input, time passed in.

```ts
import type { PrStatus } from '@devdigest/shared';
export const STALE_DAYS = 7;
export function isStale(status: PrStatus, updatedAt: Date, now: number): boolean {
  return status === 'reviewed' && now - updatedAt.getTime() > STALE_DAYS * DAY_MS;
}
```

`import type` and `z.infer<…>` types are fine in domain code. `z.object`, `.parse` and `.safeParse` are not.

---

## 5. Multi-table write → UnitOfWork port (§8)

**Bad**: the service opens the transaction on the raw DB.

```ts
await this.container.db.transaction(async (tx) => {
  await tx.insert(t.reviews).values(review);
  await tx.insert(t.findings).values(findings);
});
```

**Good**:

```ts
// modules/reviews/ports.ts (application)
export interface ReviewTx {
  reviews: ReviewStore;
  findings: FindingStore;
}
export interface ReviewUnitOfWork {
  run<T>(work: (tx: ReviewTx) => Promise<T>): Promise<T>;
}

// modules/reviews/service.ts (application)
await this.deps.uow.run(async ({ reviews, findings }) => {
  const id = await reviews.insert(workspaceId, review);
  await findings.insertMany(workspaceId, id, kept);
});

// modules/reviews/repository/uow.ts (infrastructure)
export class DrizzleReviewUnitOfWork implements ReviewUnitOfWork {
  constructor(private readonly db: Db) {}
  run<T>(work: (tx: ReviewTx) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) =>
      work({ reviews: new ReviewRepo(tx), findings: new FindingRepo(tx) }),
    );
  }
}
```

Repositories accept either `Db` or the transaction handle, so the same class works inside and outside a transaction.
A single-statement write needs none of this.

---

## 6. New external system → port + adapter + fake (§5, §9)

Say a feature needs Slack notifications.

```ts
// src/application/ports/notifier.ts  (≥2 modules will use it; otherwise modules/<m>/ports.ts)
export interface Notifier {
  notifyReviewDone(input: { prUrl: string; score: number | null }): Promise<void>;
}

// src/adapters/notifier/slack.ts  (infrastructure: the only place the SDK is imported)
import { WebClient } from '@slack/web-api';
import type { Notifier } from '../../application/ports/notifier.js';
import { ExternalServiceError } from '../../platform/errors.js';

export class SlackNotifier implements Notifier {
  constructor(private readonly client: WebClient, private readonly channel: string) {}
  async notifyReviewDone({ prUrl, score }: { prUrl: string; score: number | null }) {
    try {
      await this.client.chat.postMessage({ channel: this.channel, text: `Review done (${score ?? '—'}): ${prUrl}` });
    } catch (err) {
      throw new ExternalServiceError('Slack notification failed', { cause: String(err) });
    }
  }
}

// src/adapters/mocks.ts
export class MockNotifier implements Notifier {
  sent: Array<{ prUrl: string; score: number | null }> = [];
  async notifyReviewDone(input: { prUrl: string; score: number | null }) { this.sent.push(input); }
}

// platform/container.ts: the token comes from SecretsProvider, never process.env in the adapter
```

---

## 7. Port declared in the adapter → port in the consumer (§5)

**Bad** (`src/adapters/depgraph/index.ts`): the interface lives next to its implementation, and the adapter imports a feature constant.

```ts
import { SUPPORTED_EXT } from '../../modules/repo-intel/constants.js'; // outer → feature
export interface DepGraph { buildEdges(root: string, files: string[]): Promise<FileEdge[]>; }
export class DepCruiseGraph implements DepGraph { /* … */ }
```

**Good** (for new code; migrating this one is a separate task):

```ts
// modules/repo-intel/ports.ts (application of the consumer)
export interface DepGraph {
  buildEdges(root: string, files: string[], exts: readonly string[]): Promise<FileEdge[]>;
}

// src/adapters/depgraph/index.ts
import type { DepGraph, FileEdge } from '../../modules/repo-intel/ports.js'; // importing a PORT file is allowed
export class DepCruiseGraph implements DepGraph { /* … */ }
```

An adapter may import the **port file** it implements. It must never import a module's service,
repository, constants or helpers.

---

## 8. Application test with fakes (§12)

```ts
// modules/pulls/service.test.ts: unit lane, no Docker
import { describe, expect, it } from 'vitest';
import { PullsService } from './service.js';
import type { PullsStore } from './ports.js';

const store: PullsStore = {
  listForRepo: async () => [{ id: 'p1', number: 1 /* … */ } as PrMeta],
  sumCostByPr: async () => new Map([['p1', 0.42]]),
};

it('adds run cost to each PR', async () => {
  const service = new PullsService({ pulls: store, github: new MockGitHubClient() });
  const [pr] = await service.listForRepo({ workspaceId: 'w', userId: 'u' }, 'r1');
  expect(pr.cost_usd).toBe(0.42);
});
```

`PullsRepository.sumCostByPr` gets its own `pulls.repository.it.test.ts` against testcontainers Postgres.

---

## 9. Lite module → growing a layer (§3)

```
# small module: flat
modules/settings/
  routes.ts
  service.ts
  repository.ts
  constants.ts

# infrastructure grew to 3 files → only that layer becomes a folder
modules/reviews/
  routes.ts
  service.ts
  run-executor.ts
  ports.ts
  repository/
    review.repo.ts
    run.repo.ts
    uow.ts
```

Don't create `domain/` or `http/` just because `repository/` exists.

---

## 10. dependency-cruiser rules (future enforcement, §13)

The full config is [templates/dependency-cruiser.example.cjs](templates/dependency-cruiser.example.cjs).
**Don't wire it into `server/` or CI in this task.** The core idea is one `forbidden` rule per
inward-only violation:

```js
const pkg = (...names) => `node_modules/(${names.join('|')})/`; // unanchored: also matches pnpm's .pnpm/… paths
const REPOSITORY = '^src/modules/[^/]+/(repository\\.ts|repository/|[^/]+\\.repo\\.ts)';

{
  name: 'no-drizzle-outside-repositories',
  severity: 'error',
  from: { path: '^src/modules/', pathNot: REPOSITORY },
  to: { path: [pkg('drizzle-orm', 'postgres'), '^src/db/(schema|client|rows)\\.ts$'], dependencyTypesNot: ['type-only'] },
},
{
  name: 'no-sdk-outside-adapters',
  severity: 'error',
  from: { path: '^src/', pathNot: '^src/adapters/' },
  to: { path: pkg('openai', '@anthropic-ai/sdk', 'octokit', 'simple-git', '@vscode/ripgrep', '@ast-grep/napi', 'js-tiktoken') },
},
```

Two traps:
- dependency-cruiser rejects regexes it considers unsafe (nested quantifiers such as
  `(\.pnpm/[^/]+/node_modules/)?`) with "has an unsafe regular expression. Bailing out."
  Keep the patterns flat.
- `import type` edges only show up with `tsPreCompilationDeps: true`. That's how
  `dependencyTypesNot: ['type-only']` lets domain code use `import type` from `@devdigest/shared`.

When enforcement lands: migrate one module, run `depcruise-baseline` to record known violations,
then validate with `--ignore-known` in CI so only **new** violations fail.
