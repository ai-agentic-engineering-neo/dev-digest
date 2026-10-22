# Presentation ring — Fastify

In Onion terms a Fastify route is a **driving adapter**: it translates HTTP into a call on the
application ring and translates the result (or error) back. It owns no business rules.

## Rules

1. **One plugin per module** — `modules/<name>/routes.ts` exports a default async plugin,
   registered by hand in `modules/index.ts` (no autoload — see `server/INSIGHTS.md`).
2. **Typed by contracts.** `const app = appBase.withTypeProvider<ZodTypeProvider>()` and every
   route declares `schema: { params, body, querystring }` from `@devdigest/shared` or
   `_shared/schemas.ts` (`IdParams`). Invalid input becomes `422` before the handler runs — don't
   `Schema.parse(req.body)` by hand.
3. **Handler shape** — at most: resolve context → call one service method → set status → return.
   ```ts
   app.post('/repos', { schema: { body: RepoInput } }, async (req, reply) => {
     const { workspaceId, userId } = await getContext(app.container, req);
     const { repo, created } = await service.add(workspaceId, userId, req.body.url);
     reply.status(created ? 201 : 200);
     return repo;
   });
   ```
4. **No data access in handlers or hooks.** No `container.db`, no `drizzle-orm`, no
   `container.github()` — the service does that.
5. **Errors are thrown, not shaped.** Services throw `AppError` subclasses; the single error
   handler in `app.ts` builds the `{ error: { code, message, details } }` envelope. A handler only
   sets non-error statuses (`201`, `202`, `204`).
6. **Construct the service once per plugin** (`const service = new XService(app.container)`), not
   per request. Register job handlers there too (`service.registerCloneJobHandler()`).
7. **DI channel = `app.container`** (decorated once in `app.ts`). Don't add per-module
   `decorate()` for services — that hides dependencies across encapsulation scopes.
8. **Cross-cutting plugins register before modules** (helmet, cors, rate-limit, SSE) so module
   scopes inherit them via encapsulation. Module-specific hooks stay inside the module plugin.
9. **SSE** routes stream events produced by the application ring (`container.runBus`); they don't
   compute them.

## Smells

- A route file over ~150 lines or with `import { and, eq … } from 'drizzle-orm'` → the service and
  repository are missing (current example: `modules/pulls/routes.ts`).
- `try/catch` in a handler that maps errors to `reply.status(...)` → throw an `AppError` in the service.
- A helper in `routes.ts` that computes a domain value → move to `helpers.ts`.

## Sources

- Fastify — [Plugins Guide](https://fastify.dev/docs/latest/Guides/Plugins-Guide/),
  [Plugins](https://fastify.dev/docs/latest/Reference/Plugins/),
  [Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/)
- [fastify/help #284 — DI best practice](https://github.com/fastify/help/issues/284)
- Snyk — [Fastify plugins as building blocks](https://snyk.io/blog/fastify-plugins-for-backend-node-js-api/)
- [fastify-type-provider-zod](https://github.com/turkerdev/fastify-type-provider-zod)
