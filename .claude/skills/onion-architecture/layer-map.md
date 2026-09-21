# Onion Architecture — Layer Map

How the five Onion layers map onto dev-digest's actual files, and where the
repo already follows this pattern versus where it's a known gap. Read
[SKILL.md](SKILL.md) first for the core Dependency Rule this table enforces.

## The Five Layers

```
                    ┌─────────────────────────────────────┐
                    │  Interface / Transport               │
                    │  routes.ts (Fastify handlers)         │
                    │  → parses request, calls service,     │
                    │    maps result to HTTP status/body     │
                    │  ┌───────────────────────────────┐     │
                    │  │  Infrastructure                │     │
                    │  │  server/src/adapters/*          │     │
                    │  │  repository.ts (Drizzle/Postgres)│    │
                    │  │  → implements the ports          │    │
                    │  │  ┌─────────────────────────┐     │    │
                    │  │  │  Ports (boundary)          │     │    │
                    │  │  │  shared/adapters.ts          │     │    │
                    │  │  │  → interfaces only, no I/O    │     │    │
                    │  │  │  ┌───────────────────┐     │     │    │
                    │  │  │  │  Application         │     │     │    │
                    │  │  │  │  service.ts            │     │     │    │
                    │  │  │  │  → orchestrates, depends│     │     │    │
                    │  │  │  │    on ports, not concretes│    │     │    │
                    │  │  │  │  ┌───────────────┐   │     │     │    │
                    │  │  │  │  │  Domain (center) │   │     │     │    │
                    │  │  │  │  │  shared/contracts│   │     │     │    │
                    │  │  │  │  │  reviewer-core/   │   │     │     │    │
                    │  │  │  │  └───────────────┘   │     │     │    │
                    │  │  │  └─────────────────────┘     │     │    │
                    │  │  └───────────────────────────────┘     │    │
                    │  └─────────────────────────────────────┘     │
                    └─────────────────────────────────────────────┘
```

| Layer | dev-digest location | May import | Must NOT import |
|---|---|---|---|
| **Domain** (center) | `@devdigest/shared/contracts/*.ts` (Zod-derived types); `reviewer-core/` (pure diff→prompt→LLM→findings engine) | nothing outward — plain TS/Zod only | Fastify, Drizzle, Octokit, `openai`/`@anthropic-ai/sdk`, Node `fs`/`net` |
| **Application** | `server/src/modules/<name>/service.ts` | domain types, ports from `shared/adapters.ts` | concrete SDKs directly (`octokit`, `openai`, `@anthropic-ai/sdk`, `simple-git`) — only through an injected port; also **Drizzle** and any `db/client.js`/`db/schema/*` import — persistence goes through `repository.ts`, same rule as `routes.ts` below |
| **Ports** (boundary) | `@devdigest/shared/adapters.ts` (`AuthProvider`, `SecretsProvider`, `GitHubClient`, `GitClient`, `CodeIndex`, `Embedder`, `LLMProvider`) | domain types only | any concrete implementation |
| **Infrastructure** | `server/src/adapters/{git,github,llm,secrets,auth,embedder,codeindex}/*`; `repository.ts` (Drizzle) | the SDK it wraps, the port interface it implements | nothing else in the module — no business rules here |
| **Interface / Transport** | `server/src/modules/<name>/routes.ts` | the module's `service.ts` | Drizzle, Octokit, LLM SDKs, business logic |

## Applied in This Repo (dev-digest)

The layering above is not aspirational — most of it already exists:

- **Ports for external I/O already exist and are the pattern to copy.**
  [server/src/vendor/shared/adapters.ts](../../../server/src/vendor/shared/adapters.ts)
  defines `AuthProvider`, `SecretsProvider`, `GitHubClient`, `GitClient`,
  `CodeIndex`, `Embedder`, `LLMProvider`. Real implementations live in
  [server/src/adapters/{git,github,llm,secrets,auth,embedder,codeindex}](../../../server/src/adapters)
  and mocks in
  [server/src/adapters/mocks.ts](../../../server/src/adapters/mocks.ts).
  [server/src/platform/container.ts](../../../server/src/platform/container.ts)
  wires the real adapters behind those interfaces and exposes
  `ContainerOverrides` for test injection, with the comment "Services depend
  on these interfaces, not the concrete classes" — that sentence *is* the
  Dependency Rule for this repo. When adding a new integration, follow this
  existing pattern rather than inventing a new one.
- **`routes.ts` → `service.ts` → `repository.ts` → db is already the
  convention** for every `server/src/modules/<name>/` module (documented in
  [server/AGENTS.md](../../../server/AGENTS.md)), confirmed in `repos`,
  `reviews`, and `agents`. `routes.ts` stays transport-only; `constants.ts`
  holds literals; `helpers.ts` holds pure transforms.
- **`reviewer-core/` is the cleanest example of the domain center**: zero
  imports of a database, GitHub client, or filesystem. Its only side effect
  is one call through an injected `LLMProvider` port — see
  [reviewer-core/AGENTS.md](../../../reviewer-core/AGENTS.md). Point to this
  package whenever someone asks "what does a pure domain/application layer
  actually look like here." See the worked example in
  [examples.md](examples.md).
- **The one layer that is NOT yet inverted: persistence.** Unlike GitHub/LLM/
  git/auth/secrets, Drizzle repositories have no port interface — services
  instantiate them directly, e.g.
  `this.repo = new RepoRepository(container.db)`. This is a known,
  acceptable gap for existing modules (retrofitting every repository is not
  worth the churn on its own), but **new modules with non-trivial repository
  logic should consider an `IRepoRepository`-style interface** so the service
  can be tested against a mock the same way GitHub/LLM already are. Flag this
  gap in review rather than silently copying the un-inverted pattern
  forward — see [enforcement.md](enforcement.md).
- **The repository↔service seam is where a raw Drizzle type is allowed to
  exist, and only there.** `RepoRepository` returns `RepoRow` (`type RepoRow
  = typeof t.repos.$inferSelect`,
  [server/src/modules/repos/repository.ts:11](../../../server/src/modules/repos/repository.ts)),
  and `RepoService` immediately maps it through `toRepoDto()` into the
  Zod-derived `Repo` domain type from `@devdigest/shared` before returning
  (`server/src/modules/repos/service.ts:39,109-112`). A public `service.ts`
  method should never return a `$inferSelect`/`$inferInsert` type — if you
  see one escape past `service.ts`, that's a layering violation (see
  [enforcement.md](enforcement.md)).
