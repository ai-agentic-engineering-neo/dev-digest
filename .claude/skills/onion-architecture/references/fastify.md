# Fastify = UI ring

Fastify lives only in `routes.ts` (+ `app.ts`, `server.ts`, `platform/` plugins). Nothing inward imports `fastify` or receives `FastifyRequest`/`FastifyReply`.

## A route does exactly four things
```ts
app.post('/repos', { schema: { body: RepoInput } }, async (req, reply) => {
  const ctx = await getContext(app.container, req);          // 1. tenancy from transport
  const { repo, created } = await addRepo.execute(ctx, req.body.url); // 2. one use-case call
  reply.status(created ? 201 : 200);                          // 3. status code
  return toRepoDto(repo);                                     // 4. domain → DTO
});
```
No `if` that encodes a business rule, no Drizzle, no SDK, no `container.jobs` inside a handler.

## Wiring per module
```ts
export default async function reposRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const uc = composeRepos(app.container);   // compose.ts — the only Container consumer
  ...
}
```
- One module = one plugin, registered in `src/modules/index.ts` (no autoload). Its hooks/decorators stay inside its encapsulation context — "Parent contexts cannot access entities within their descendant contexts" (Fastify Encapsulation).
- `fastify-plugin` breaks encapsulation "only for the plugin it wraps" — use it only for cross-cutting infrastructure (container decorator, auth, error handler), never to share a module's services.
- Don't `app.decorate('repoService', …)`: decorators are a service locator in disguise. Pass use cases through `compose.ts`.

## Errors
Inner rings throw `AppError` subclasses; the global error handler in `app.ts` is the only `AppError → HTTP` mapper (`{ error: { code, message, details } }`). Routes don't `try/catch` to build error bodies.

## Hooks
`onRequest`/`preHandler` are for transport concerns (auth, rate limit, host check). Authorization that depends on domain data (is this run in this workspace?) is a use-case check, not a hook.

## SSE
`fastify-sse-v2` streaming stays in `routes.ts`; the use case publishes through a `RunEvents` port and the route subscribes to the bus.
