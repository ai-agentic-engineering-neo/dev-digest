# Fastify in the onion

Fastify is the driving adapter (ring 3b). Everything here is about keeping it
there. Framework detail (hooks, serialization, plugins ecosystem) is in the
vendored `fastify-best-practices` skill; this file is only the boundary.

## `routes.ts` is a plugin and nothing else

- Default-export an `async function <name>Routes(app: FastifyInstance)`. Registration in `modules/index.ts` gives it its own encapsulation context: hooks and decorators added inside stay inside (Encapsulation reference). Do not use `fastify-plugin` in a module; it breaks that isolation and is only for app-wide utilities registered in `app.ts`.
- First line: `const app = appBase.withTypeProvider<ZodTypeProvider>()`. Every route declares `schema: { params, body, querystring, response }` with Zod. The type provider infers `req.params` and `req.body`; a hand `parse` in the handler is a duplicate validation and a rule 9 violation.
- Every handler starts with `const { workspaceId, userId } = await getContext(app.container, req)`. That is the *only* request-bound data that crosses into the service, and it crosses as plain strings.
- The handler body is three lines: context, service call, return. Branching on business state (`if (repo.status === …)`), loops over rows, or `try/catch` around a driver belong in the service or the adapter.
- `reply` is used only for status codes (`reply.code(201)`) and SSE. A service never receives `req` or `reply`.

## Composition happens in two places only

- `app.ts` decorates the container once (`app.decorate('container', new Container(...))`) before modules load, so every module sees the same instance. Decorators are checked at boot, and never decorate `request`/`reply` with reference-type values (Decorators reference).
- `routes.ts` builds its service from the container: `new SkillsService({ repo: app.container.skillsRepo, github: () => app.container.github() })`. The container is the composition root (Seemann); the route only *selects* which members the service needs. This is why the ESLint rule for routes permits `app.container` while the service ring forbids importing `Container`.
- Load order in `app.ts` (Getting Started guide): ecosystem plugins (helmet, cors, rate-limit, SSE) → error handler → modules. The error handler is registered *before* modules so encapsulated children inherit it; a module never sets its own.

## Errors

`app.setErrorHandler` in `app.ts` is the single place that maps `AppError`
subclasses, Zod validation errors and unknowns to the `{ error: { code,
message, details } }` envelope. Handlers throw, they do not `reply.send` an
error body.

## Testing the driving adapter

`buildApp()` is exported separately from `server.ts` (Testing guide:
"Separating concerns makes testing easy"). Route smoke tests call
`buildApp({ config, overrides })` and `app.inject(...)`; no port is opened.
`overrides` swaps driven adapters. Keep route tests to request shape, status
codes and the error envelope with mocked drivers; test business rules through
the service with a fake port (`di-and-testing.md`).

## Job handlers and SSE are driving adapters too

`RepoService.registerCloneJobHandler()` and `RepoIntelService.registerIndexJobHandlers()`
are called from `routes.ts`, which is the right place: the job runner and the
`RunBus` are infrastructure that *drive* the service, and the plugin is where
the wiring for one module lives.
