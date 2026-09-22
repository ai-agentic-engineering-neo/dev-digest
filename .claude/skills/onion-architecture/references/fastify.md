# Fastify: http ring + composition root

## Contents
- Module plugin shape
- Composition root
- Handler rules
- Error mapping
- Encapsulation and decorators

## Module plugin shape

Target pattern (legacy modules still do `new XxxService(app.container)` — see `migration.md`):

```ts
// modules/agents/routes.ts — http ring
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Agent } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

export default async function agentsRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();   // not inherited — call per plugin
  const agents = app.container.agentsService;          // built in the composition root

  r.get('/agents/:id', { schema: { params: IdParams, response: { 200: Agent } } }, async (req) => {
    const ctx = await getContext(app.container, req);
    return agents.get(ctx.workspaceId, req.params.id); // throws NotFoundError; no reply.code here
  });
}
```

- One default-exported plugin per module, registered in `modules/index.ts`
  (static registration, no autoload — works the same under tsx, bundler and vitest).
- The plugin reads ready-made use cases; it never constructs repositories/adapters.

## Composition root

`app.ts` builds `Container` (config, db, adapters with test `overrides`) and
decorates `app.container`. Wire use cases there, passing only the ports they need (illustrative):

```ts
// platform/container.ts
get agentsService() {
  return (this._agents ??= new AgentsService({
    agents: new AgentsRepository(this.db),
    llm: (p) => this.llm(p),
  }));
}
```

Rules (Seemann's Composition Root): one place, next to the entry point; libraries
(`reviewer-core`) have none; nothing else calls `new` on infrastructure classes.

## Handler rules

- Input is already parsed by the route schema (`validatorCompiler` = zod).
- Allowed in a handler: `getContext`, one use-case call, DTO mapping, `reply.code(201)`
  for success variants, SSE plumbing.
- Not allowed: Drizzle, `src/db`, adapters, loops with business rules, try/catch that
  converts errors to status codes.

## Error mapping

- Domain/application throw `AppError` subclasses from `platform/errors.ts`
  (`NotFoundError`, `ValidationError`, `ExternalServiceError`, `ConfigError`).
- The root `setErrorHandler` in `app.ts` (registered before modules so encapsulated
  plugins inherit it) maps: zod request validation → 422, response serialization → 500,
  `AppError` → its `statusCode` + `{ error: { code, message, details } }`.
- New error kinds: add a class with a stable `code`; don't set status in services.
- Legacy: `AppError` carries `statusCode` (HTTP detail in an inner ring). Target is a
  code → status table in the handler; see `migration.md`.

## Encapsulation and decorators

- `register` creates a child context; children see parents' decorators, never the
  reverse. `fastify-plugin` lifts a plugin's decorators to the parent — use it only
  for infrastructure (db, config, auth), with `name` and `dependencies`.
- Never `decorateRequest` with a reference type (object/array); set it in an
  `onRequest` hook or use a getter.
- Error handlers are encapsulated too — don't add per-module handlers that
  diverge from the root envelope.
