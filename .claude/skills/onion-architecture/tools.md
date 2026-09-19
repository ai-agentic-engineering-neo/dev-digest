# Onion rules per tool

These are the rules of [SKILL.md](SKILL.md), applied to each library we use. Every example comes from this repo.

## Fastify: presentation ring + composition root

- **A module is a plugin.** `routes.ts` default-exports `async function (appBase: FastifyInstance)`, and `src/modules/index.ts` registers it. Registration is static: no autoload, one import and one entry in the map.
- **DI goes through the `container` decorator** (`app.decorate('container', container)` in `app.ts`). The route builds its service from `app.container`. It never imports a concrete adapter or repository class from outside its module.
- **Handler shape:** Zod-validated `params`/`body` (type provider) → `getContext(app.container, req)` → **one** service call → status code. The status choice may use a service result flag (`created ? 201 : 200`).

  ```ts
  // good: modules/repos/routes.ts
  app.post('/repos', { schema: { body: RepoInput } }, async (req, reply) => {
    const { workspaceId, userId } = await getContext(app.container, req);
    const { repo, created } = await service.add(workspaceId, userId, req.body.url);
    reply.status(created ? 201 : 200);
    return repo;
  });
  ```
- **Errors:** services throw `AppError` subclasses (`NotFoundError`, `ValidationError`, `ExternalServiceError`, `ConfigError` from `platform/errors.ts`). The global `setErrorHandler` in `app.ts` serializes them. Routes don't `try/catch` just to set a status.
- **Hooks and decorators** carry cross-cutting concerns (auth context, rate limits, logging). Business rules never go in `onRequest`/`preHandler`.
- **Logging from services:** a service never imports `fastify` to get a logger. It takes a structural `Logger` in its constructor (the shape `{ info, warn, error }`, like `export type Logger` in `modules/reviews/run-executor.ts`), and the route passes `app.log`. Degrading gracefully ("GitHub down → serve persisted data") is a service decision, so the warning is logged there.
- **SSE / streaming** (`platform/sse.ts`, `fastify-sse-v2`) is transport. The service emits domain events on `runBus`, and the route only pipes them.

## Drizzle: infrastructure ring only

- `drizzle-orm`, `src/db/schema*`, `src/db/client.ts` (values) are imported **only** in `repository.ts` / `repository/*.repo.ts` and `src/db/**`. Other rings may use `import type { XRow }` from the repository or from `db/rows.ts`.
- **One repository per module** (`modules/repos/repository.ts` is the reference). It **writes** only tables its module owns, and it may read or join other modules' tables for its own read model. A shared entity (agents, reviews, runs) gets its repository exposed through `Container` (`container.agentsRepo`, `container.reviewRepo`).
- **Every query is tenancy-scoped:** `workspaceId` goes into the `where`, not into a post-query `if`. Filtering (`isNull(dismissedAt)`, `inArray(severity, …)`) goes into SQL, not `.filter()` afterwards.
- **Repos return rows or `undefined`/`boolean`.** They never throw `NotFoundError`. The service decides what a missing row means.
- **Mapping row → DTO** (camelCase row → snake_case wire) is a pure function in `helpers.ts`.
- **Aggregations** ("reduce on read": `pulls/total-cost.ts`, `findings-counts.ts`): the repository fetches the minimal rows, and a pure domain function reduces them. The reducer gets unit-tested without a DB.
- **Transactions:** the service owns them, repos accept an optional `tx?: DbExecutor`, and no network I/O happens inside. See SKILL.md § Transactions.
- **Schema changes:** edit `src/db/schema/*.ts`, then run `pnpm db:generate`. Never hand-edit `migrations/`.

## Zod: parse at every edge, trust inside

"Parse, don't validate": validation happens once where untrusted data enters, and it produces a precise type.

| Edge | Where | How |
|---|---|---|
| HTTP in | `routes.ts` | `schema: { body, params, querystring }` with the contract (`fastify-type-provider-zod`) |
| HTTP out | contract types | return `z.infer<typeof X>`-typed DTOs |
| External API / LLM response | adapter (`src/adapters/**`), `reviewer-core/src/llm/structured.ts` | `schema.safeParse`, then `ExternalServiceError` on failure |
| Env / config | `platform/config.ts` | parsed once at startup |
| Job payload | job handler entry (in `service.ts`) | `satisfies Payload` on enqueue. `JobRunner` always round-trips payloads through the `jobs` table (jsonb), so **new handlers `Payload.parse(payload)`** with a Zod schema. The `payload as X` casts in existing handlers are debt, not the pattern. |

- **Contracts live in `vendor/shared/contracts/*.ts`:** a PascalCase export plus `z.infer` of the same name, with snake_case wire fields. Keep the server and client copies in sync.
- Inside the domain and application rings, **don't re-parse** and **don't hand-write** wire types.
- Zod is the one library the domain ring may import, because contracts *are* domain types.

## External SDKs: adapters behind ports

`openai`, `@anthropic-ai/sdk`, `octokit`, `simple-git`, `@vscode/ripgrep`, `@ast-grep/napi`, `js-tiktoken`, `dependency-cruiser` are imported **only** under `src/adapters/**`. (Exception: `reviewer-core/src/llm/openrouter.ts`.) Pure in-memory libraries with no external system (`zod`, `graphology`, `p-queue`) are not SDKs and may be used in any ring that needs them.

Adding one:
1. **Port:** add an interface in `server/src/vendor/shared/adapters.ts` (server copy only) (`GitHubClient`, `LLMProvider`, … are the model). Its methods use domain words (`createReviewComment`), not SDK words.
2. **Adapter:** `src/adapters/<name>/<impl>.ts` implements the port. It maps SDK types to port types, wraps calls with `platform/resilience.ts` (timeout/retry) where the others do, and turns SDK errors into `ExternalServiceError`.
3. **Mock:** add it to `src/adapters/mocks.ts`.
4. **Wiring:** a lazy getter in `platform/container.ts`, secret lookup via `SecretsProvider` there (never in a module), and an `overrides.<name>` field for tests.
5. **Use:** the service calls `await this.container.<name>()`. A secret-gated adapter throws `ConfigError` when the secret is missing.

## dependency-cruiser: the enforcement

- `server/.dependency-cruiser.cjs` holds the forbidden rules. `pnpm arch` runs with `--ignore-known`, so only **new** violations fail.
- `.dependency-cruiser-known-violations.json` is the debt snapshot. It may only shrink. Regenerate it (`pnpm arch:baseline`) **only after removing** violations, and say so in the commit.
- Rules: `no-db-outside-infra` (drizzle / `db/schema|client` values only in repositories; `import type` from `db/rows.ts` is allowed), `routes-thin`, `domain-pure`, `sdk-only-in-adapters`, `no-cross-module-internals` (another module only via its `index.ts`), `no-import-app-entry`, `reviewer-core-pure` (it may import `@devdigest/shared` contracts, nothing else from the server), `no-circular` (warn).
- New module or ring? The rules key on file names (`routes.ts`, `service.ts`, `repository.ts`, `helpers.ts`, `model.ts`, `constants.ts`). Use those names and the rules apply automatically.

## Tests per ring

| Ring | Test type | Tools |
|---|---|---|
| Domain | plain unit, no mocks | `vitest`, e.g. `test/pulls-status.test.ts`, `test/total-cost.test.ts` |
| Application | service with mocked ports | build the app/container with `ContainerOverrides` + `adapters/mocks.ts` |
| Infrastructure | repository against real Postgres | `*.it.test.ts` (testcontainers, self-skips without Docker) |
| Presentation | route smoke via `app.inject` | `test/routes-smoke.test.ts` |

If a domain function needs a mock to be tested, it isn't domain yet. Push the I/O out.
