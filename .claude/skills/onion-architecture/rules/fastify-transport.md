---
name: fastify-transport
description: Fastify routes, SSE and job handlers as driving adapters — transport only
metadata:
  tags: fastify, routes, transport, driving-adapter, sse, jobs
---

# Fastify as a driving adapter

A route is the outermost ring. It translates HTTP into a use-case call and the result
back into HTTP. It holds no business knowledge, so replacing Fastify with anything
else would not touch a single rule.

## A route does exactly four things

1. Declares its Zod `params` / `body` / `querystring` schema in `schema:`.
2. Resolves request context (`getContext`).
3. Calls **one** application-service method.
4. Maps the outcome to a status code.

Anything else belongs one ring inward.

## Forbidden in `routes.ts`

- `import { eq, and, desc } from 'drizzle-orm'`
- `import * as t from '../../db/schema.js'`
- `import type { AgentRow } from '../../db/rows.js'`
- `container.db` in any form
- **any adapter**: `container.github()`, `container.llm(id)`, `container.git`,
  `container.codeIndex`, `container.embedder()`, `container.secrets` — the route
  calls a service, and the service holds the port
- business conditions (status transitions, eligibility, quota, scoring)
- building a DTO field by field — that is `helpers.ts`

## A route never calls an adapter

```ts
// BAD — the use case lives in the transport layer and talks to GitHub itself
app.post('/pulls/:id/comments', { schema: { params: IdParams, body: CommentBody } }, async (req) => {
  const gh = await app.container.github();
  return gh.createReviewComment(repo, req.body);
});

// GOOD — one service call; the service received the GitHubClient port from the container
app.post('/pulls/:id/comments', { schema: { params: IdParams, body: CommentBody } }, async (req) => {
  const { workspaceId } = await getContext(app.container, req);
  return service.addComment(workspaceId, req.params.id, req.body);
});
```

The BAD form cannot be unit-tested without HTTP, and the next caller of the same use
case — a job handler, the CI runner — has to copy the adapter call instead of calling
the service.

## Validation is declarative

Schemas go in `schema:` so invalid input is rejected with 422 before the handler runs.
Never hand-roll `Schema.parse(req.body)` inside a handler: it moves the boundary into
the handler and changes the error shape.

```ts
// GOOD — schema declared, one service call, status mapping only
app.post('/repos', { schema: { body: RepoInput } }, async (req, reply) => {
  const { workspaceId, userId } = await getContext(app.container, req);
  const { repo, created } = await service.add(workspaceId, userId, req.body.url);
  reply.status(created ? 201 : 200);
  return repo;
});
```

```ts
// BAD — transport reaching into persistence, and a rule living in the route
app.get('/workspace/pulls', async (req) => {
  const rows = await app.container.db
    .select()
    .from(t.pullRequests)
    .where(eq(t.pullRequests.workspaceId, workspaceId));
  return rows.filter((r) => r.state === 'open' && r.draft === false);
});
```

The fix is mechanical: move the query into `repository.ts`, the filter into
`service.ts`, and leave the route with one call.

## Errors

Throw domain / application errors (`NotFoundError`, `AppError`) from the inside and let
the registered error handler map them to status codes. A route must not invent an error
taxonomy, and a service must not import `reply` or set a status code.

## SSE and jobs are also driving adapters

`platform/sse.ts` and `platform/jobs.ts` are entry points just like HTTP: something
outside triggers a use case. The same rule applies — a job handler resolves ports and
calls a service; it does not open a transaction or query a table itself.

## Plugin order is infrastructure, not architecture

helmet, cors, rate-limit, SSE and the error handler register before modules so
encapsulated module plugins inherit them. That ordering is a Fastify constraint; it
says nothing about layering and is not a reason to put logic in a plugin.
