# Examples — bad → good, from the agents module

Bad snippets are trimmed from real code (`server/src/modules/agents/*`, `pulls/routes.ts`,
2026-11-24). Good snippets show the target shape; they are sketches, not copy-paste-ready code.

## 1. Service builds its own repository and holds the container

```ts
// ✘ modules/agents/service.ts
export class AgentsService {
  private repo: AgentsRepository;
  constructor(private container: Container) {
    this.repo = new AgentsRepository(container.db);     // concrete Drizzle class, built in the core
  }
  async listModels(provider: Provider) {
    const llm = await this.container.llm(provider);     // reaches into the service locator
    …
  }
}
```

```ts
// ✔ modules/agents/application/agents.service.ts
export interface AgentsDeps {
  agents: AgentsRepository;                             // port from ../domain/ports.ts
  uow: UnitOfWork<{ agents: AgentsRepository }>;
  llmFor: (p: Provider) => Promise<LLMProvider>;
}
export class AgentsService {
  constructor(private readonly d: AgentsDeps) {}
  async listModels(provider: Provider): Promise<ModelInfo[]> {
    try { return await (await this.d.llmFor(provider)).listModels(); } catch { return []; }
  }
}

// ✔ modules/agents/index.ts — wiring lives here
const service = new AgentsService({
  agents: c.agentsRepo, uow: c.agentsUow, llmFor: (p) => c.llm(p),
});
```

Why: the dependencies are visible in the type, the service is unit-testable with three fakes,
and only the composition root knows about Drizzle.

## 2. Business rule hidden in the repository, two writes without a transaction

```ts
// ✘ modules/agents/repository.ts
async update(workspaceId, id, patch) {
  const existing = await this.getById(workspaceId, id);
  const configChanged = isConfigChange(existing, patch);          // business decision
  const nextVersion = configChanged ? existing.version + 1 : existing.version;
  const [row] = await this.db.update(t.agents).set({ …, version: nextVersion }) … ;
  if (configChanged && row) await this.snapshotVersion(row, nextVersion);   // 2nd write, no tx
  return row;
}
```

```ts
// ✔ modules/agents/domain/policies.ts — pure, unit-tested
export function applyAgentPatch(agent: Agent, patch: AgentPatch): { next: Agent; versionBumped: boolean } {
  const changed = isConfigChange(agent, patch);
  const next = { ...agent, ...definedOnly(patch), version: changed ? agent.version + 1 : agent.version };
  return { next, versionBumped: changed };
}

// ✔ modules/agents/application/agents.service.ts
async update(ws: WorkspaceId, id: AgentId, patch: AgentPatch): Promise<Agent> {
  return this.d.uow.run(async ({ agents }) => {
    const current = await agents.byId(ws, id);
    if (!current) throw new AgentNotFound(`Agent ${id} not found`);
    const { next, versionBumped } = applyAgentPatch(current, patch);
    await agents.save(next);
    if (versionBumped) await agents.appendVersion(await snapshotOf(next, agents));
    return next;
  });
}
```

## 3. Route talks to the database

```ts
// ✘ modules/pulls/routes.ts (pattern)
app.get('/repos/:id/pulls', async (req) => {
  const rows = await app.container.db.select().from(t.pullRequests).where(…);   // SQL in delivery
  return rows.map(…);
});
```

```ts
// ✔ http/routes.ts → application → port → infrastructure
app.get('/repos/:id/pulls', { schema: { params: IdParams, response: { 200: PullList } } },
  async (req) => {
    const { workspaceId } = await getContext(auth, req);
    return presentPulls(await pulls.listForRepo(workspaceId, req.params.id));
  });
```

## 4. Row type leaking out; DTO built from the row

```ts
// ✘ modules/agents/helpers.ts — Drizzle row → API DTO in one jump, used by the service
export function toAgentDto(row: AgentRow): Agent { return { …, system_prompt: row.systemPrompt, provider: row.provider as Provider }; }
```

```ts
// ✔ infrastructure/mappers.ts      row → domain   (knows Drizzle)
export const toAgent = (row: AgentRow): Agent => ({ id: row.id as AgentId, systemPrompt: row.systemPrompt, provider: asProvider(row.provider), … });
// ✔ http/presenter.ts              domain → contract   (knows the API)
export const presentAgent = (a: Agent): AgentDto => ({ id: a.id, system_prompt: a.systemPrompt, provider: a.provider, … });
```

The service signature becomes `Promise<Agent>` (domain), never `AgentRow` and never the
`snake_case` contract.

## 5. "Not found" as `undefined` + hand-made 404 in every route

```ts
// ✘ routes.ts (repeated 8× in agents)
const agent = await service.get(workspaceId, req.params.id);
if (!agent) throw new NotFoundError('Agent not found');
```

```ts
// ✔ use case throws a domain error; one handler maps it
// domain/errors.ts
export class AgentNotFound extends DomainError { readonly code = 'agent_not_found'; }
// platform/errors.ts
export const DOMAIN_STATUS = { agent_not_found: 404 } as const;
// route
return presentAgent(await service.get(workspaceId, req.params.id));
```

Keep the status and envelope the client sees (`404`, `{ error: { code, message } }`). As of
2026-11-24 `client/src` doesn't branch on `code: 'not_found'`, so a more specific code like
`agent_not_found` is safe — re-check with `grep -rn not_found client/src` before changing codes.

## 6. Domain importing outward

```ts
// ✘ modules/agents/domain/policies.ts
import { z } from 'zod';                                   // runtime Zod in domain
import type { AgentRow } from '../../../db/rows.js';       // infrastructure type
import { NotFoundError } from '../../../platform/errors.js'; // HTTP-aware error
```

```ts
// ✔
import type { Provider } from '@devdigest/shared';          // type-only shared vocabulary
import type { Agent, AgentPatch } from './types.js';
import { DomainError } from '../../_shared/domain/errors.js';
```
