# Presentation layer: thin Fastify routes

`routes.ts` is the outermost seam between the outside world (HTTP) and the application layer. Its job is narrow: parse/validate the request, call exactly one `service.ts` method, shape the response. It should contain no business logic and no direct Drizzle access — if you find yourself writing an `if` that isn't about "what's a valid request," it belongs in `service.ts`.

## Reference: `reviews/routes.ts`

```ts
// server/src/modules/reviews/routes.ts
export default async function reviewsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new ReviewService(container);

  app.post(
    '/pulls/:id/review',
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const body = RunRequest.parse(req.body ?? {});
      const targets = await service.resolveTargets(workspaceId, { ... });
      const { runs, reviews } = await service.runReview(workspaceId, req.params.id, targets, req.log);
      return { pr_id: req.params.id, runs, reviews };
    },
  );
}
```

What makes this a well-behaved presentation layer:
- **One `service` instance, built from `container`**, instantiated once per plugin registration — not a `new ReviewRepository(...)` in sight.
- **Zod schemas (`IdParams`, `RunRequest`) validate at the boundary**, using contracts from `@devdigest/shared` — the same schemas the client uses, so "what's a valid request" is defined once, not duplicated between client and server (see the Zod-boundary note below).
- **The handler is a translation, not a decision.** `req.params.id` → `service.runReview(...)` → return its result. No branch here encodes business rules (e.g. "can this workspace run more than N reviews" belongs in `service.ts`, not here).

## Zod at the boundary, not in the core

`fastify-type-provider-zod` gives routes compile-time-checked, runtime-validated request/response shapes. That validation is a presentation-layer concern: it's about *is this HTTP payload well-formed*, which is a different question from the domain's business rules. Once `RunRequest.parse(...)` succeeds, the rest of the call chain works with a plain validated TS object — `service.ts` never re-imports Zod to re-check what the route already checked.

This mirrors the existing `@devdigest/shared` convention exactly: `export const RunRequest = z.object({...}); export type RunRequest = z.infer<typeof RunRequest>;` — the schema is the single source of truth for both the runtime check (routes) and the compile-time type (service/repository).

> "UI validation should usually be a consumer of domain rules... every runtime can consume the schema differently, with the schema staying fixed while only the adapter for the runtime changes." — [One Zod Schema for UI, API, and Types — Medium](https://adewaskar.medium.com/one-validation-schema-multiple-runtimes-zod-ui-backend-8d48d9db8d15)

## Checklist for a new route handler

- [ ] Validates params/body/query via a Zod schema from `@devdigest/shared` (or a new one added there, not invented locally)
- [ ] Calls exactly one (or a small, clearly sequential set of) `service.ts` method(s)
- [ ] Contains no Drizzle import, no `db.` call
- [ ] Contains no business branching beyond request-shape concerns (auth/rate-limit config belongs in route options, not inline `if`s)
- [ ] Maps the service's return value to the HTTP response shape without reinterpreting it
