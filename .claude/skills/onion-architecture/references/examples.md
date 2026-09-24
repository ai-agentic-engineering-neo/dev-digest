# Before / after

## Contents
- Route with inline query → use case + repository
- Service locator → injected ports
- Rule in a handler → pure domain function
- SDK leaking → port
- Error status in service → domain error

## Route with inline query → use case + repository

```ts
// ❌ modules/pulls/routes.ts (http ring touching the DB)
import { and, desc, eq } from 'drizzle-orm';
import * as t from '../../db/schema.js';
r.get('/repos/:id/pulls', async (req) => {
  return app.container.db.select().from(t.pulls)
    .where(eq(t.pulls.repoId, req.params.id)).orderBy(desc(t.pulls.updatedAt));
});

// ✅ repository.ts (infrastructure)
async listForRepo(repoId: string): Promise<PrMeta[]> { /* drizzle query + map */ }
// ✅ service.ts (application)
listPulls(workspaceId: string, repoId: string) { return this.deps.pulls.listForRepo(repoId); }
// ✅ routes.ts (http)
r.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req) => {
  const ctx = await getContext(app.container, req);
  return app.container.pullsService.listPulls(ctx.workspaceId, req.params.id);
});
```

## Service locator → injected ports

```ts
// ❌
export class AgentsService {
  constructor(private container: Container) {}
  list(ws: string) { return new AgentsRepository(this.container.db).list(ws); }
}

// ✅
import type { AgentsRepository } from './repository.js';
export class AgentsService {
  constructor(private deps: { agents: AgentsRepository }) {}
  list(ws: string) { return this.deps.agents.list(ws); }
}
// container.ts: new AgentsService({ agents: new AgentsRepository(this.db) })
// test:         new AgentsService({ agents: fakeAgents })
```

## Rule in a handler → pure domain function

```ts
// ❌ routes.ts decides which findings block CI
const blocking = findings.filter(f => SEV[f.severity] >= SEV[agent.ci_fail_on]);
reply.code(blocking.length ? 409 : 200);

// ✅ domain.ts
export function blockingFindings(findings: Finding[], failOn: CiFailOn): Finding[] {
  return findings.filter((f) => SEVERITY_RANK[f.severity] >= SEVERITY_RANK[failOn]);
}
// service.ts: impureim sandwich — load (impure) → blockingFindings (pure) → save/emit (impure)
```

## SDK leaking → port

```ts
// ❌ service.ts
import OpenAI from 'openai';
const res = await new OpenAI({ apiKey }).chat.completions.create({ … });

// ✅ service.ts depends on the LLMProvider port from @devdigest/shared;
//    adapters/llm/openai.ts implements it; container.ts picks the provider + key.
const review = await this.deps.llm(agent.provider).complete({ … });
```

## Error status in service → domain error

```ts
// ❌ service knows HTTP
throw Object.assign(new Error('agent missing'), { statusCode: 404 });

// ✅ service throws a domain error; app.ts setErrorHandler maps it
throw new NotFoundError(`Agent ${id} not found`);
```
