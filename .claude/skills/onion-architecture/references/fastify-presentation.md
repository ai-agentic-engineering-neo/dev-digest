# Fastify = the presentation ring

Contents: [What a route may do](#what-a-route-may-do) · [Plugins and encapsulation](#plugins-and-encapsulation) · [Request context and tenancy](#request-context-and-tenancy) · [Errors](#errors) · [Streaming/SSE](#streamingsse) · [Anti-patterns](#anti-patterns)

API details (hooks, serialization, perf) are in `fastify-best-practices`. This file only says **what belongs in a route and what must not**.

## What a route may do

A route handler is a thin translator: [F2][Z3][B2]
1. **Declare** the contract with zod in the route `schema` (`params`, `body`, `querystring`, `response`) — `fastify-type-provider-zod` makes the same schemas the runtime validator and the static types. Invalid input → 422 before the handler runs. (`server/CLAUDE.md`: never hand-parse `req.body`.)
2. **Resolve context:** `const { workspaceId, userId } = await getContext(container, req)` (`modules/_shared/context.ts`).
3. **Call one service method** with plain values (not `req`/`reply`).
4. **Map the result** to the response shape; let errors propagate to the error handler.

```ts
// agents/routes.ts — the shape to copy (verbatim structure)
export default async function agentsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new AgentsService(app.container);

  app.get('/agents/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const agent = await service.get(workspaceId, req.params.id);
    if (!agent) throw new NotFoundError('Agent not found');
    return agent;
  });
}
```

A route must **not**: import `drizzle-orm`/`db/schema`, build SQL, call GitHub/LLM/git directly, contain business rules, loop over writes, or `throw` anything with HTTP knowledge other than the shared domain errors. If you are scrolling in a handler, extract.

## Plugins and encapsulation

- One feature module = one Fastify plugin (`modules/<name>/routes.ts`, default export) registered in `modules/index.ts`. Registration is static (no autoload), by design. [F3]
- Each `register` creates an **encapsulated context**: children inherit from ancestors, not the other way round, and `fastify-plugin` breaks encapsulation only for the plugin it wraps. Use this property deliberately: a module's hooks/decorators stay inside the module. [F2][F3]
- The DI container (`platform/container.ts`) is the composition root and is exposed on the Fastify instance as `app.container` (a decoration). Each plugin builds **its own** service from it (`new AgentsService(app.container)`). Keep it that way: the decoration is a hand-off point for the composition root, not a place to hang domain services or repositories for routes to grab. [F4]
- Because plugins get everything through `app.container`, tests build the app with `buildApp({ config, overrides })` and pass fakes. `@fastify/awilix` is a DI alternative; the repo's hand-rolled container is sufficient. [E4]

## Request context and tenancy

`getContext` goes through `AuthProvider` (MVP: `LocalNoAuthProvider` → default workspace + system user). Every module uses it, so **workspace scoping is never forgotten**. In the layers:
- Presentation resolves `workspaceId`/`userId` and passes them **down as arguments**.
- Services and repositories take `workspaceId` explicitly and scope every query by it.
- Domain code never reads `req`, headers or sessions.

## Errors

Single mapping point: `app.setErrorHandler` in `app.ts` (registered before modules so every plugin inherits it). It maps: zod/validation → `422 validation_error`; `AppError` → its status; response-serialization failure → generic 500; anything else → 500 with logging.

Layering rules: [O4][O1]
- Services and domain throw the shared error taxonomy from `platform/errors.ts` (`NotFoundError`, `ValidationError`, `ExternalServiceError`, `ConfigError`, `AppError`). They never build a reply or pick a status inline.
- Repositories/adapters **translate** library errors (Postgres constraint violation, Octokit 404/rate-limit, SDK timeouts) into those errors; don't let raw driver errors reach the handler.
- Caveat in this repo: `AppError` itself carries an HTTP `statusCode`. Treat it as the project's accepted shorthand; don't spread status-code decisions beyond choosing the error class.

## Streaming/SSE

SSE (`platform/sse.ts`, `fastify-sse-v2`) is a **presentation** concern. The route owns the stream and the connection lifecycle; the application ring publishes events to a bus (`runBus`) without knowing who listens. The route subscribes the bus to the stream. Services never receive `reply`.

## Anti-patterns

- Handler with `container.db.select()…` / `.insert()…` (today: `pulls`, `settings`, `polling`, `workspace` routes — see the profile).
- Handler that calls `container.github()` and loops over results to upsert rows (today: `pulls/routes.ts` list endpoint). Belongs in a service using a repository.
- Passing `req`/`reply`/`app.log` into a service. Pass values; inject a logger interface if logging is needed.
- Validating the same body again in the service "to be safe". Parse once at the edge. [Z2]
- Returning a Drizzle row straight from a handler: the response schema then silently depends on the table.
