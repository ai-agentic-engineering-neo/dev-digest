# Fastify — the transport ring

Fastify belongs to ring 4. Its job is to turn HTTP into a call on an application service
and turn the result (or an `AppError`) back into HTTP. Nothing more.

## A module is a plugin; the plugin is the module's local composition root

```ts
// modules/repos/routes.ts  (ring 4)
export default async function reposRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const c = app.container;
  const service = new RepoService({          // compose HERE, not inside the service
    repos: new RepoRepository(c.db),
    git: c.git,
    jobs: c.jobs,
  });

  app.post('/repos', { schema: { body: RepoInput } }, async (req, reply) => {
    const { workspaceId, userId } = await getContext(c, req);
    const { repo, created } = await service.add(workspaceId, userId, req.body.url);
    reply.status(created ? 201 : 200);
    return repo;
  });
}
```

Rules:
- **Validate in `schema`**, never `Schema.parse(req.body)` in the handler (server/AGENTS.md). The Zod type provider gives the handler a typed, already-parsed `req.body`.
- **Handler = 3 steps**: context (`getContext`) → one service call → status/shape. If a handler has an `if` about business state or a loop, that logic belongs in the service.
- **Don't pass `req`/`reply` into services.** Pass plain values (`workspaceId`, ids, parsed body).
- **Don't log business events with `app.log` from the service.** Inject a logger port if a service needs one; `run-logger.ts` is the existing pattern for runs.
- **Response shape** comes from the `@devdigest/shared` contract the service returns; add a `response` schema when you want Fastify to strip extra fields.

## Decorators and encapsulation
- `app.decorate('container', container)` (in `app.ts`) is the **only** decorator for dependencies. Don't decorate services or repositories onto the instance — that turns Fastify into a service locator for business code.
- Plugin encapsulation (each module registered in its own context) means hooks and decorators added inside a module stay inside it. Use that for module-scoped hooks (e.g. `local-only` guards), not for sharing state between modules. *(Fastify — Encapsulation)*
- Modules are registered statically in `modules/index.ts` (not `@fastify/autoload`) so tsx, the bundler and vitest share one path.

## Errors
- Services throw `AppError` subclasses from `platform/errors.ts` (ring 1).
- The single `app.setErrorHandler` in `app.ts` maps them to `ApiErrorBody` `{ error: { code, message, details } }` with `statusCode`.
- Routes may *choose* a success status (`201` vs `200`) but don't catch domain errors to re-map them.

## Background jobs
- The route plugin registers the handler once (`service.registerCloneJobHandler()` / `c.jobs.register(kind, …)`); the handler body is a service method.
- Job payloads are persisted JSON — **parse them** (Zod) at the start of the handler; they are a trust boundary (see `repos/service.ts` `runCloneJob`, which re-validates `owner/name`).

## SSE
`platform/sse.ts` (`runBus`) is ring 4. Services that emit progress get a narrow publisher port (`{ publish(runId, event) }`), not the bus or `reply.raw`.

## Testing the transport
- `buildApp` + `app.inject()` with `ContainerOverrides` (mock adapters from `adapters/mocks.ts`). No real network. *(Fastify — Testing)*
- Route tests check status codes, validation errors and envelope shape; business branches are tested on the service with fake ports.

## DI options
- **Pure DI in the composition root** (what we do: `platform/container.ts` + per-module wiring in `routes.ts`). Recommended — explicit, typed, no magic. *(Seemann)*
- `@fastify/awilix` is the common container-based alternative in the Fastify ecosystem. Don't introduce it without a team decision; if ever used, resolve only in the root, never inside services.
