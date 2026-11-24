# Fastify 5 — the delivery adapter

Fastify is a **mechanism**: it turns HTTP into calls on use cases and results back into HTTP.
Everything Fastify-specific stays in `modules/<f>/http/`, `modules/<f>/index.ts`, `app.ts`.
For general Fastify usage (hooks, logging, schemas, performance) see skill `fastify-best-practices`.

## 1. Thin handlers

A handler has exactly four steps:

```ts
app.put('/agents/:id', { schema: { params: IdParams, body: UpdateAgentBody, response: { 200: AgentDto } } },
  async (req) => {
    const { workspaceId } = await getContext(auth, req);            // 1. context
    const agent = await agents.update(workspaceId, req.params.id,   // 2. one use case,
      toUpdateAgentCommand(req.body));                             //    plain values
    return presentAgent(agent);                                     // 3. present
  });                                                               // 4. errors → handler
```

Not allowed in a handler: `container.db`, Drizzle, SDK calls, loops over business rules,
calling two use cases and combining results (make that one use case), `if (!x) throw new NotFoundError()`
in new code (the use case throws `AgentNotFound`).

## 2. Nothing Fastify crosses inward

- Never pass `req`, `reply`, `FastifyInstance`, `FastifyBaseLogger` to a service.
- `getContext(container, req)` (in `_shared/context.ts`) is a delivery helper: it reads the
  request and returns `{ workspaceId, userId }` — pass those strings on.
  Target signature: `getContext(auth: AuthProvider, req)` so modules don't need the container for it.
- Logging from application code goes through a small `Logger` port (or return data and let
  the route log), not `app.log`.

## 3. Validation and serialization at the edge

- Request: `schema: { params, querystring, body }` with Zod via `fastify-type-provider-zod`
  (v4.x — the Zod 3 line; do not upgrade to v5+, it requires Zod 4). `validatorCompiler` /
  `serializerCompiler` are registered once in `app.ts`.
- Response: declare `response: { 200: Contract }` for new routes — the serializer checks that
  the presenter output matches the transport contract; a mismatch becomes a logged 500
  (`isResponseSerializationError` branch in `app.ts`), never a leaked object.
- Map body → command in `http/` (snake_case DTO → camelCase domain input). The service never
  sees `system_prompt`-style DTO keys.

## 4. Errors: domain codes, one HTTP mapping

```ts
// modules/_shared/domain/errors.ts  (inner — no HTTP)
export abstract class DomainError extends Error {
  abstract readonly code: string;
  constructor(message: string, readonly details?: unknown) { super(message); this.name = new.target.name; }
}
// modules/agents/domain/errors.ts
export class AgentNotFound extends DomainError { readonly code = 'agent_not_found'; }

// platform/errors.ts (delivery) — the only place that knows statuses
export const DOMAIN_STATUS: Record<string, number> = { agent_not_found: 404, run_already_finished: 409 };
// app.ts setErrorHandler: if (err instanceof DomainError) reply.status(DOMAIN_STATUS[err.code] ?? 400) …
```

Keep the existing `ApiErrorBody` envelope `{ error: { code, message, details } }` and the
Zod/serialization branches. `AppError(code, message, statusCode)` remains for delivery-layer
code and legacy modules during migration.

## 5. One module = one encapsulated plugin built by a factory

```ts
// modules/agents/index.ts — composition for this module
import type { FastifyPluginAsync } from 'fastify';
export default (async (app) => {
  const c = app.container;                     // allowed here: this file IS composition
  const service = new AgentsService({ agents: c.agentsRepo, uow: c.uow, llm: (p) => c.llm(p) });
  await app.register(agentsRoutes, { service, auth: c.auth });
}) satisfies FastifyPluginAsync;
```

- `modules/index.ts` keeps registering statically (no autoload — see its header comment).
- Routes receive `{ service, auth }` via plugin options; they don't touch `app.container`.
- Fastify encapsulation: decorators/hooks registered inside a module plugin stay inside it.
  Don't wrap module plugins with `fastify-plugin` (that leaks them to the root); only `app.ts`
  decorates `container`.

## 6. SSE and long-running work

- `fastify-sse-v2` routes are delivery. The use case publishes through a `RunEvents` port
  (`publish(runId, event)`); the SSE route subscribes to `RunBus`, which implements that port.
- Kicking off work (`void executeRuns()` today, `JobRunner.enqueue` for clone/index) is done by
  the use case via a `JobScheduler`/`RunLauncher` port; the infrastructure implementation owns
  the `.catch` that records failures.
