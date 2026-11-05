# Fastify 5 — the presentation ring

Fastify is the **outermost** ring. It translates HTTP into use-case calls and use-case results into HTTP.

## Rules

- **One module = one encapsulated plugin.** `routes.ts` default-exports `async function <name>Routes(appBase)`,
  registered statically in `modules/index.ts`. Encapsulation keeps a module's decorators/hooks local
  ([Plugins Guide](https://www.fastify.dev/docs/latest/Guides/Plugins-Guide/)). Use `fastify-plugin`
  only for genuinely app-wide infrastructure (it breaks encapsulation on purpose) — never for a module.
- **Type provider + schemas at the edge.** `const app = appBase.withTypeProvider<ZodTypeProvider>()`, then
  `schema: { params, querystring, body }` with Zod from `@devdigest/shared` or `_shared/schemas.ts`.
  Handlers receive typed values — never hand-parse `req.body`.
- **Handler shape** (≤ ~10 lines):
  ```ts
  app.post('/agents', { schema: { body: CreateAgentBody } }, async (req) => {
    const { workspaceId, userId } = await getContext(app.container, req);
    return service.create(workspaceId, userId, req.body);
  });
  ```
  No `container.db`, no `t.*`, no `if` over business state, no `try/catch` that changes the status code.
- **Service per plugin registration.** Instantiate the service once inside the plugin
  (`const service = new XService(app.container)`), not per request.
- **Container is a decorator, not a service locator for routes.** Routes read `app.container` only to
  build the service and call `getContext`. Anything else (`container.github()`, `container.db`) belongs
  in the service/repository.
- **Errors:** throw `AppError` subclasses (`NotFoundError`, `ConfigError`, …) from inner rings; the global
  `setErrorHandler` in `app.ts` renders `{ error: { code, message, details? } }`. Never `reply.status(...)` ad hoc.
- **Cross-cutting concerns = hooks/plugins** registered before modules in `app.ts` (helmet, cors,
  rate-limit, SSE). Per-route config goes in route options (`config: { rateLimit: … }`).
- **SSE:** the route only subscribes the reply to `container.runBus` and streams; event production
  belongs to application code (see `jobs-and-sse.md`).
- **Response DTOs:** the handler returns the DTO produced by the service (snake_case per contract).
  Casing conversion happens in mappers (repository/helpers), not in routes.

## Anti-patterns

| Smell | Fix |
|---|---|
| `import { eq } from 'drizzle-orm'` in `routes.ts` | Move query to repository, expose via service |
| Route calls two repositories and merges results | That orchestration is a use case → service method |
| `try { … } catch { reply.code(404) }` | Throw `NotFoundError` in the service |
| Decorating `app` with module-specific helpers | Plain function in the module, or a port in the container |

## References
- [Fastify — The hitchhiker's guide to plugins](https://www.fastify.dev/docs/latest/Guides/Plugins-Guide/)
- [Fastify — Testing (`inject`)](https://fastify.dev/docs/latest/Guides/Testing)
- Tool-level detail: `.claude/skills/fastify-best-practices/`
