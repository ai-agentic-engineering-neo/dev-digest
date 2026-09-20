# Fastify — routes are the outer edge

Fastify (`app.ts`, `modules/*/routes.ts`) is a **delivery mechanism**. Ring 4 only.

## Rules

1. **A handler does three things:** resolve context (`getContext`) → call **one** service method → return. No queries, no aggregation, no GitHub calls, no branching business rules.
2. **Validate with route schemas, not by hand.** Use `fastify-type-provider-zod` (`app.withTypeProvider<ZodTypeProvider>()`, `schema: { params, querystring, body }`). `app.ts` already installs `validatorCompiler`/`serializerCompiler`. No `RunRequest.parse(req.body)` inside handlers (today: `reviews/routes.ts:32` — tracked debt).
3. **Response shape = DTO from `@devdigest/shared`.** Add a `response` schema when practical so the serializer enforces the contract; map domain → DTO in a pure mapper (`toAgentDto`), never inside the handler.
4. **Services and helpers never import `fastify`.** Need logging in a service? Accept a structural logger type (`reviews/run-executor.ts` exports `type Logger = {…}`), don't pass `FastifyBaseLogger` or `req`.
5. **Never pass `req`/`reply` inward.** Extract what the service needs (`workspaceId`, `userId`, parsed body) in the handler. `_shared/context.ts#getContext` is the one adapter from a request to a tenancy context.
6. **Errors:** services throw the `AppError` family (`platform/errors.ts`); the single `app.setErrorHandler` in `app.ts` maps them to the `{ error: { code, message, details } }` envelope. A handler that catches an error to build a "degraded" response is doing business logic — move it into the service (tracked: `repo-intel/routes.ts`).
7. **Wiring:** a routes plugin builds its service **once at registration** from explicit deps. Today `new AgentsService(app.container)`; target is `new AgentsService({ repo: container.agentsRepo, … })` (see `platform-di.md`). Routes may read `app.container`; nothing inward may.
8. **Plugins vs DI.** Fastify encapsulation + `decorate` is a fine *transport-level* DI mechanism (`app.decorate('container', container)`), and `fastify-plugin` is for cross-cutting infrastructure (cors, helmet, rate-limit, SSE). Do **not** use decorators to smuggle domain services through `req`/`app` into inner rings.
9. **Module registration** stays a static registry (`modules/index.ts`), one plugin per feature. A new module = new folder + one registry line.
10. **SSE / streaming:** the route owns the HTTP stream; the service publishes to a port (`runBus`), it does not write to `reply`.

## Skeleton (target shape)

```ts
// modules/<name>/routes.ts  — ring 4 (edge)
export default async function fooRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new FooService({ repo: app.container.fooRepo, github: () => app.container.github() });

  app.post('/foos', { schema: { body: CreateFooBody } }, async (req, reply) => {
    const { workspaceId, userId } = await getContext(app.container, req);
    const foo = await service.create(workspaceId, req.body, userId);
    reply.status(201);
    return foo;
  });
}
```

## Testing

Build the app with `ContainerOverrides` (mock adapters from `adapters/mocks.ts`) and call `app.inject()`. Route tests assert status + envelope; business rules are tested at the service with fakes (`testing.md`).

## Sources

Fastify [Plugins guide](https://fastify.dev/docs/latest/Guides/Plugins-Guide/) (encapsulation, `fastify-plugin`, decorators) · [Decorators](https://fastify.dev/docs/latest/Reference/Decorators/) · Skill: `fastify-best-practices` for mechanics.
