# Fastify as the inbound adapter

Fastify is a delivery mechanism. A route translates HTTP into a use-case call
and the result back into HTTP — nothing else. If you deleted Fastify and drove
the service from a CLI or a job, no business rule should be lost.

## What a handler does (and only this)

1. Validate input — declaratively, via the route `schema` (`params`, `body`,
   `querystring`, `response`) with `fastify-type-provider-zod`. Never
   `Schema.parse(req.body)` in the handler (repo rule).
2. Resolve request context — `getContext(app.container, req)` →
   `{ workspaceId, userId }`.
3. Call **one** service method with plain typed arguments (not `req`).
4. Map the outcome — status code (`reply.status(201)`), `undefined` → 404,
   domain error → `AppError` (module `toHttpError`).
5. Return the DTO (serialized by the `response` schema when declared).

Smell: a handler longer than ~15 lines, any `if` about business state, any
`container.db`, any loop that persists things → move it into the service.

## Plugins, encapsulation, registration

- Each module is one Fastify plugin (`modules/<m>/routes.ts`) — encapsulation
  gives a natural per-module boundary (Fastify docs: *Encapsulation*).
- Registration is **static** in `modules/index.ts` — do not switch to
  `@fastify/autoload` (repo rule; works under tsx, bundler and vitest).
- Build the service **once per plugin** (`const service = createXService(app.container)`),
  not per request.
- Cross-cutting HTTP concerns (CORS, helmet, rate limit, error handler,
  validator/serializer compilers) are configured in `src/app.ts`, not in modules.

## DI with the Container (our choice — no Awilix)

- `app.decorate('container', container)` in `app.ts` makes the composition root
  available as `app.container`.
- Only `routes.ts` and `compose.ts` read it. Services get narrow deps.
- Tests swap implementations with `ContainerOverrides` (`buildApp({ overrides })`)
  — the reason services must not `new` their own adapters.
- Don't add per-module `app.decorate(...)` for services; keep wiring in one
  place (Seemann, *Composition Root*).

## Errors

- One global `setErrorHandler` (`src/app.ts`) renders `{ error: { code, message, details } }`:
  zod validation → 422, `AppError` → its `statusCode`, else 500.
- New code: domain/application errors carry a `code` only; the route maps them
  to `AppError` subclasses (see `layers-and-placement.md` → `http-errors.ts`).
  Status codes are an HTTP concern.
- Don't `try/catch` just to log-and-rethrow; let the global handler do it.

## Jobs and SSE are inbound adapters too

- `container.jobs.register(KIND, handler)`: the handler parses/casts the payload
  and calls a service method — same thinness as a route. Register once from
  `routes.ts` / `compose.ts` (existing pattern in `repos/routes.ts`).
- SSE (`fastify-sse-v2`, `runBus`): the route subscribes and streams; the
  service publishes domain events through a port (e.g. `RunEvents.publish`),
  not by importing the SSE plugin.

## Testing the adapter

`app.inject({ method, url, payload })` exercises routing, validation,
serialization and error mapping without a port (Fastify docs: *Testing*).
Use mock adapters from `src/adapters/mocks.ts` via `ContainerOverrides`.
Business branches are tested at the service level, not through HTTP.
