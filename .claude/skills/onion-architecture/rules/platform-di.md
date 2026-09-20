# Platform & DI — one composition root, narrow dependencies

## The Container

`platform/container.ts` is the **composition root**: it builds `db`, `secrets`, `auth`, `jobs`, `runBus`, lazily builds adapters (`git`, `codeIndex`, `depgraph`, `tokenizer`), exposes async factories (`github()`, `llm(id)`, `embedder()`), and shared repositories (`agentsRepo`, `reviewRepo`). `ContainerOverrides` is the test seam. That is **correct and stays**.

The problem is not the Container — it is passing the **whole Container into services** (service locator): `new AgentsService(container)`, `new RepoIntelService(this)`, `pipeline/full.ts`. Any service can then reach `db` and every port, so the dependency rule can't be checked and unit tests need a fake Container.

## Rules

1. **Only routes, `_shared/context.ts` and the composition root may reference `Container`.** Enforced by `inner-no-container`.
2. **Services take an explicit `Deps` object** of ports and factories, defined next to the service:
   ```ts
   export interface AgentsServiceDeps {
     repo: AgentsRepo;                       // port (module types.ts)
     llm: (id: Provider) => Promise<LLMProvider>;
     clock?: () => Date;                     // only if needed
   }
   export class AgentsService { constructor(private deps: AgentsServiceDeps) {} }
   ```
   The routes plugin (or the Container) assembles it: `new AgentsService({ repo: c.agentsRepo, llm: (id) => c.llm(id) })`.
3. **Pass factories, not resolved clients, for lazy/optional deps** (`github: () => Promise<GitHubClient>`), so "no token configured" stays a runtime, per-request outcome (`ConfigError`) and offline mode keeps working.
4. **No `new Repository(db)` inside services.** Repositories are constructed in the Container (like `agentsRepo`/`reviewRepo`) or the routes plugin and injected.
5. **Break the Container ↔ service cycle.** `Container → RepoIntelService → (type) Container` is a cycle today. With `Deps` the service no longer imports the Container, so the cycle disappears.
6. **`platform/*` other than `container.ts` must not import `modules/**`** (`platform-not-inward`). `platform/jobs.ts` uses Drizzle directly: treat `JobRunner` as an infrastructure adapter behind a small port (`jobs.enqueue(name, fn)`); either move it under `adapters/jobs/` or exempt it explicitly in `.dependency-cruiser.cjs` with a comment — do not silently grow the exemption list.
7. **Logging (pino, structured).** Fastify's pino logger stays at the edge. Inner rings take a structural `Logger` (`{ info, warn, error }` with `(obj, msg)` signature) — see `reviews/run-executor.ts`. Log with fields (`{ runId, repoId, err }`), not interpolated strings, so runs are traceable. Never log secrets/tokens.
8. **Config:** read once in `platform/config.ts`; pass values (`cloneDir`, flags) via `Deps`, never `process.env` in inner rings.
9. **Test seam:** every new dependency gets a `ContainerOverrides` slot (adapters) or is a plain `Deps` field (services).

## Migration order for a module (Phase 3)

`Deps` interface → constructor takes `Deps` → routes plugin builds it → remove `import type { Container }` from the service → baseline shrinks.

## Sources

Palermo — Onion requires DI to wire outer implementations into inner interfaces ([part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/)) · Graça, [DDD, Hexagonal, Onion, Clean, CQRS… How I put it all together](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/) · Fastify [Plugins guide](https://fastify.dev/docs/latest/Guides/Plugins-Guide/).
