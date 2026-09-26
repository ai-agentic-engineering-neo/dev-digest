# Each ring in this stack

Fastify 5 · fastify-type-provider-zod · Drizzle 0.38 over postgres-js · Zod 3 ·
vitest + testcontainers. For API detail of each tool use its own skill; this file
says only which ring the tool belongs to and how to keep it there.

## Presentation — Fastify

Fastify's encapsulation is the ring boundary: each `modules/<m>/routes.ts` is a
plugin, registered after the cross-cutting plugins so it inherits them.

```ts
export default async function agentsRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const service = new AgentsService(depsFrom(app.container)); // once per plugin

  r.get('/agents/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.get(workspaceId, req.params.id);            // one call, DTO out
  });
}
```

- Zod schema on the route = the parse-at-the-edge step. The handler receives a
  typed, already-parsed value; the service never re-parses it.
- `response` schemas also serialize: a service returning an extra field does not
  leak it.
- `reply.code()`, headers, SSE streaming, `req.log` — here only. A service that
  needs a logger gets a `Logger` interface in its deps (as `run-executor.ts` does),
  not `FastifyBaseLogger`.
- Do not `fastify-plugin`-wrap a feature module to share its internals; sharing
  goes through the container.

## Application — plain TypeScript classes or functions

```ts
export interface AgentsDeps {
  agents: Pick<AgentsRepository, 'get' | 'update' | 'insertVersion'>;
  llm: (provider: Provider) => Promise<LLMProvider>;   // port from @devdigest/shared
  uow: UnitOfWork;
}

export class AgentsService {
  constructor(private deps: AgentsDeps) {}
}
```

- `Pick<Repository, …>` keeps the dependency on the repository *type* only and
  documents exactly which queries the use case needs; a fake for tests is an
  object literal.
- Anything async that needs a secret (`github()`, `llm(id)`) stays a factory
  function in deps, because keys are resolved at call time.
- No `Container` in new service signatures: taking the whole container hides
  what the service uses and creates the `container ↔ service` import cycle
  (`repo-intel` has it today).

## Domain — functions over contract types

- Input and output are `@devdigest/shared` types or local plain types. zod is
  allowed; `z.infer` types are the domain vocabulary.
- Pure means: same input → same output, no I/O. Time and ids are parameters
  (`now: Date`), not `new Date()` inside.
- Existing examples to copy: `pulls/status.ts` (status and cost derivation),
  `reviews/helpers.ts` (declared "side-effect free"), `reviewer-core`'s
  `reduceReviews` / `countBlockers`.

## Infrastructure — Drizzle repositories

```ts
export class AgentsRepository {
  constructor(private db: Db) {}

  async get(workspaceId: string, id: string, tx?: TxScope): Promise<Agent | null> {
    const [row] = await executor(this.db, tx)
      .select().from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)));
    return row ? toAgentDto(row) : null;                    // mapping stays here
  }
}
```

- Every method that touches a domain table takes `workspaceId`; `findings` is
  scoped by joining `reviews`.
- Aggregates: `sum()` → `parseAggregateCost`, `count()` → already a number.
  These coercions never leave the repository.
- When one repository facade re-declares a method type (`reviews/repository.ts`
  vs `repository/run.repo.ts`), change both — or better, derive the facade type
  from the implementation (`Parameters<RunRepo['complete']>[1]`).
- Row types (`db/rows.ts`) are infrastructure vocabulary. A service that needs
  `AgentRow` is a sign the repository returns the wrong type.

## Infrastructure — adapters

- One folder per external system under `src/adapters/`, one class implementing a
  port from `vendor/shared/adapters.ts`, one mock in `adapters/mocks.ts`.
- Adapters translate: SDK errors → `ExternalServiceError`, SDK payloads →
  contract types. They do not decide business outcomes.
- Pure parsing (diff parsing, AST extraction) is not an adapter even if an
  adapter uses it. New pure parsers go to a domain location
  (`src/domain/<topic>/` or `reviewer-core`) so modules can import them without
  crossing `no-concrete-adapters-in-modules`.

## Composition root — `platform/container.ts`

- Lazy, memoised getters; overrides win (`ContainerOverrides`).
- The container may build `Deps` objects for services
  (`agentsDeps()`), keeping `new` out of routes if a module wants that.
- The composition root is the only place allowed to import a concrete adapter
  and a module's classes together.

## Tests — vitest

| Ring | File | Setup |
|---|---|---|
| Domain | `*.test.ts` next to the function or in `test/` | none |
| Application | `*.test.ts` | object-literal `Deps` or `ContainerOverrides` + `adapters/mocks.ts` |
| Repository | `*.it.test.ts` (**must** have that suffix) | testcontainers Postgres |
| Route | `*.it.test.ts` with `app.inject()` | full app |

A test that needs Postgres only to check arithmetic is the signal that the
arithmetic belongs in the domain ring.
