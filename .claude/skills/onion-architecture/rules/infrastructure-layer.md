# Infrastructure layer: implementing ports

Infrastructure is the outermost, most-replaceable ring: Drizzle queries, HTTP clients, SDK calls, filesystem access. In this repo that's `server/src/modules/<feature>/repository.ts` (data access) and `server/src/adapters/*` (external integrations: GitHub, GitLab, git, embedder, LLM providers, secrets, auth, codeindex, depgraph, tokenizer), plus `reviewer-core/src/llm/openrouter.ts` for the one adapter that ships inside the pure package.

The rule for this layer is the mirror image of the application layer's: infrastructure code **implements** the port interfaces defined inward (in `@devdigest/shared/adapters.ts`), and never the other way around. Nothing inward ever imports a concrete adapter class.

## Reference: a repository as the ONLY DB-touching layer

`server/src/modules/reviews/repository.ts` states its own contract in its doc-comment:

```ts
/**
 * A2 — review data-access. The ONLY layer touching the DB for the review
 * domain. Owns `reviews`, `findings`, `pr_intent`, and persists the
 * observability rows `agent_runs` + `run_traces`.
 */
export class ReviewRepository {
  constructor(private db: Db) {}

  insertReview(values: {...}): Promise<ReviewRow> {
    return reviewRepo.insertReview(this.db, values);
  }
  // every method is a named, typed data-access operation —
  // no raw Drizzle query ever appears in service.ts or routes.ts
}
```

Two things worth copying when you add a new one:
1. **Its public methods are named after what the caller wants** (`getPull`, `insertFindings`, `markReviewed`), not after the SQL shape. `service.ts` reads like business steps, not queries.
2. **`ReviewRow = typeof t.reviews.$inferSelect` — the Drizzle-inferred type — stays declared in `repository.ts` and is only exported for use *within* the infrastructure boundary** (other repository files, DTO mappers). It should not leak into `service.ts`'s public API; `service.ts` maps rows to plain DTOs (see `helpers.ts`'s `reviewToDto`) before returning them upward.

## Reference: an adapter implementing a shared port

`server/src/adapters/github/octokit.ts` implements `CodeHostClient` (the port interface from `@devdigest/shared`). `reviewer-core/src/llm/openrouter.ts` implements `LLMProvider` the same way:

```ts
// reviewer-core/src/llm/openrouter.ts
export class OpenRouterProvider implements LLMProvider {
  readonly id: 'openai' | 'openrouter';
  private client: OpenAI;   // the vendor SDK is fully contained HERE

  constructor(apiKey: string, opts: OpenRouterProviderOptions = {}) { /* ... */ }

  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    // the ONLY place that talks to the `openai` package in this file's blast radius
  }
}
```

Notice the class name doesn't appear anywhere in `reviewer-core/src/review/run.ts` — `run.ts` only ever sees `input.llm: LLMProvider`. That `OpenRouterProvider` happens to live *inside* the "pure" `reviewer-core` package is not a contradiction: the package's purity claim is about `run.ts`/`prompt.ts`/`grounding.ts` having no I/O, not about the whole package. The adapter is still infrastructure — it's just packaged alongside its port for convenience, and it's still swapped via injection, never imported by the application code directly.

## Drizzle-specific guidance

- Wrap Drizzle queries in a per-resource repository module — don't call `db.select()`/`db.insert()` from a route handler or a service method. This is already the convention (`modules/<feature>/repository.ts`, further split by aggregate under `repository/` for larger modules like `reviews`).
- Repositories should stay reusable across transaction contexts: accept the `db`/`tx` handle via constructor or parameter rather than importing a module-level singleton, so a caller can pass a `tx` from `db.transaction(...)` when a use-case needs atomicity across repositories. The service layer owns the transaction boundary (it knows the use-case's scope); the repository doesn't need to know it's inside one.
- Keep `$inferSelect`/`$inferInsert` types at the infrastructure boundary; map to `@devdigest/shared` Zod-inferred types before returning data to `service.ts`'s callers.

Further reading:
- [Repository Pattern in Nest.js with Drizzle ORM — Medium](https://medium.com/@vimulatus/repository-pattern-in-nest-js-with-drizzle-orm-e848aa75ecae)
- [Atomic Repositories in Clean Architecture and TypeScript — Sentry Engineering Blog](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/)
- [Drizzle ORM Best Practices: Principles, Patterns, and Real-World Case Studies](https://paulserban.eu/blog/post/drizzle-orm-best-practices-principles-patterns-and-real-world-case-studies/)
- [Drizzle ORM in Production: Patterns I Use After 6 Client Projects — Hassan Javed](https://www.hassanjaved.work/blog/drizzle-orm-patterns-production-2026)

Fastify + Clean/Onion project shapes for context (not to be copied wholesale — this repo's vertical-slice convention already exists):
- [boilerplate-typescript-fastify-clean-architecture — GitHub](https://github.com/aslupin/boilerplate-typescript-fastify-clean-architecture)
- [fastify-clean-architecture — GitHub (tonyfreed)](https://github.com/tonyfreed/fastify-clean-architecture)
- [clean-architecture-fastify-mongodb — GitHub (borjatur)](https://github.com/borjatur/clean-architecture-fastify-mongodb)
