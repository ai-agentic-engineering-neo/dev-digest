# Module layout

Every feature module under `server/src/modules/<feature>/` follows the same layered shape. Pick this layout by default; deviate only with a reason (see [pragmatism.md](pragmatism.md)).

## Idealised layout

```
server/src/modules/<feature>/
  routes.ts        # presentation: Zod schemas + Fastify handlers, thin
  service.ts       # application service: depends on ports via app.container
  repository.ts    # persistence adapter: ONLY file that imports drizzle
  repository/      # optional sub-repos composed into repository.ts
  types.ts         # local domain types (optional)
  *.test.ts        # unit — ContainerOverrides + mocks
  *.it.test.ts     # integration — testcontainers Postgres
```

## What goes in each file

### `routes.ts` — presentation (thin)

- Declares Zod request/response schemas (pair with `fastify-type-provider-zod`).
- Extracts validated input from `request`, calls the service, maps the service return to a response.
- **Never** imports Drizzle, adapters, or `../db/schema`.
- **Never** holds business logic — if there's an `if` branch deciding business outcome, it belongs in the service.

### `service.ts` — application service

- Orchestrates ports (LLM, GitHub, git, secrets, …) and repositories.
- Receives everything it needs through `app.container`.
- Takes plain inputs (not `FastifyRequest`) and returns plain outputs (not `FastifyReply`).
- Throws `AppError` from `server/src/platform/errors.ts` on failure — never raw `Error` where an HTTP code matters.

### `repository.ts` — persistence adapter

- The **only** file in the module that imports from `../../db/schema` or `drizzle-orm`.
- Maps DB rows to domain types at the boundary. Don't leak `InferSelectModel` outward.
- For larger modules (see `server/src/modules/reviews/repository/`), split into single-concern sub-repos and compose them into a facade class. One sub-repo = one concern (e.g. `review.repo.ts`, `run.repo.ts`, `pull.repo.ts`).

### `types.ts` — local domain types (optional)

- Hand-declared TypeScript interfaces/types that describe the domain shape.
- No Drizzle inference. No Fastify types. Pure TypeScript + Zod inference from `@devdigest/shared` is fine.

## Reference exemplar

`server/src/modules/reviews/` — the three-layer pattern plus the sub-repo composition under `repository/`:

```
server/src/modules/reviews/
  routes.ts
  service.ts
  repository.ts           # composes sub-repos into a facade
  repository/
    review.repo.ts
    run.repo.ts
    pull.repo.ts
  run-executor.ts         # background lifecycle, still calls into service/ports
  diff-loader.ts
  findings.ts
  helpers.ts
```

Use this as the template when adding a new module.

## Register in the composition root

Static module registration lives in `server/src/modules/index.ts`. **Every new module must be added there.** Dynamic registration is intentionally not supported — the static list is readable, debuggable, and makes module boundaries explicit.
