# Anti-patterns

Twelve layering violations seen in real codebases. Each has a one-line fix pointing at a concrete DevDigest path.

## 1. Drizzle types in the domain

```ts
// ❌ server/src/modules/reviews/service.ts
import type { reviews } from '../../db/schema/reviews.js';
```

**Fix:** Repository maps rows to hand-declared domain types; the service imports the domain type, not the schema.

## 2. Routes calling repositories directly

```ts
// ❌ server/src/modules/reviews/routes.ts
const review = await app.container.reviewRepo.find(id);
```

**Fix:** Route calls `service.get(id)`; the service calls the repository. Routes are presentation only.

## 3. Services importing concrete adapters

```ts
// ❌ server/src/modules/reviews/service.ts
import { OpenAIProvider } from '../../adapters/llm/openai.js';
```

**Fix:** Depend on `LLMProvider` (the port). Resolve via `await container.llm('openai')`.

## 4. `FastifyRequest` / `FastifyReply` leaking into services

```ts
// ❌ server/src/modules/reviews/service.ts
async run(req: FastifyRequest) { ... }
```

**Fix:** Service takes plain inputs. If auth context is needed, pass it as a parameter — not the whole request.

## 5. Adapters throwing framework-specific errors

```ts
// ❌ server/src/adapters/github/octokit.ts
throw app.httpErrors.notFound();
```

**Fix:** Throw `AppError` from `server/src/platform/errors.ts`. The global error handler maps `AppError` to the right HTTP status.

## 6. Zod schemas in `@devdigest/shared` importing Drizzle

```ts
// ❌ server/src/vendor/shared/review.ts
import { reviews } from '../../db/schema/reviews.js';
export const ReviewSchema = z.object({ id: z.infer<typeof reviews.$inferSelect>... });
```

**Fix:** Shared contracts stay pure. Drizzle inference belongs in the repository.

## 7. `process.env` reads inside services

```ts
// ❌ server/src/modules/reviews/service.ts
const key = process.env.OPENAI_API_KEY;
```

**Fix:** Env vars go through `AppConfig` (`server/src/platform/config.ts`); API keys go through `SecretsProvider` (`server/src/adapters/secrets/local.ts`). Both are ports — read them through `app.container`.

## 8. Shared mutable singletons across modules

```ts
// ❌ some-module.ts
export const cache = new Map();
```

**Fix:** Wire it via `app.container`. Singletons bypass DI and force global resets in tests.

## 9. Migrations run on boot

```ts
// ❌ server/src/server.ts
await runMigrations(); // on startup
```

**Fix:** Migrations are a manual infrastructure step — `pnpm db:migrate`. The root `CLAUDE.md` explicitly forbids boot-time migrations.

## 10. Over-mapping

Inventing a `ReviewDTO` → `ReviewDomain` → `ReviewRow` chain where all three have identical shapes.

**Fix:** If the Zod contract and the Drizzle row have the same shape, don't mint a third "domain" type for ceremony. Add a mapping layer when the shapes actually differ.

## 11. Nomenclature debates

Arguing whether `service.ts` is a "use case" or an "application service".

**Fix:** Enforce the Dependency Rule, not the vocabulary. Call it `service.ts` and move on.

## 12. Applying full onion to trivial CRUD

A read-only endpoint hitting one table with zero business logic doesn't need a 3-file module.

**Fix:** See [pragmatism.md](pragmatism.md) — the route may call the repository directly. Drizzle still stays inside `repository.ts`.
