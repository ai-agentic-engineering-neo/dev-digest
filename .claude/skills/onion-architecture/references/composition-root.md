# Composition root, DI and background work

## The composition root

`server/src/platform/container.ts` (plus `app.ts` and each `modules/<f>/index.ts` factory) is the
**only** code allowed to `new` concrete adapters, repositories and services. It already does
most of this: lazy getters, `ContainerOverrides` for tests, secret-backed adapter construction.

Mark Seemann: compose the object graph at the entry point, and **never let the container leak
out of the composition root**. Using it as a bag that services reach into is the Service
Locator anti-pattern: dependencies become invisible, tests need the whole container, and any
service can grab any adapter.

## Narrow dependencies instead of `Container`

```ts
// ✘ today (10 files)
export class AgentsService {
  private repo: AgentsRepository;
  constructor(private container: Container) { this.repo = new AgentsRepository(container.db); }
  async listModels(p: Provider) { const llm = await this.container.llm(p); … }
}

// ✔ target
export interface AgentsDeps {
  agents: AgentsRepository;                       // port
  uow: UnitOfWork<{ agents: AgentsRepository }>;  // port
  llmFor: (p: Provider) => Promise<LLMProvider>;  // port factory, not the container
}
export class AgentsService { constructor(private readonly d: AgentsDeps) {} }
```

- Deps are **ports or functions**, never concrete classes and never `Container`.
- Lazy/async adapters (LLM by provider, GitHub needs a token) are passed as factories
  (`llmFor`, `github: () => Promise<GitHubClient>`) so construction stays in the root.
- Config values a use case needs are passed as plain values (`{ cloneDir }`), not `AppConfig`.

## Container getters become port-typed

```ts
get agentsRepo(): AgentsRepository /* port */ { return (this._agentsRepo ??= new DrizzleAgentsRepository(this.db)); }
get agentsUow(): UnitOfWork<{ agents: AgentsRepository }> { return (this._agentsUow ??= new DrizzleAgentsUow(this.db)); }
```

Tests then override with fakes through `ContainerOverrides` (extend it per port) — or, better,
construct the service directly with fakes and skip the container entirely.

## No DI library

Hand-written wiring ("Pure DI") is enough at this size and keeps `tsx`/vitest/bundler paths
identical. `@fastify/awilix` was considered and not adopted: it adds request scopes and
name-based resolution we don't need, and makes the graph less explicit.

## Background work and events

| Mechanism | Ring | Core sees it as |
|---|---|---|
| `JobRunner` (p-queue + `jobs` table) — clone, index | infrastructure (`platform/jobs.ts`) | `JobScheduler` port: `enqueue(kind, payload): Promise<JobId>` |
| `void executeRuns()` — review runs in-process | infrastructure | `RunLauncher` port: `launch(runIds): void` |
| `RunBus` — in-memory SSE fan-out | infrastructure (`platform/sse.ts`) | `RunEvents` port: `publish(runId, event)` |
| Boot-time reaper (`reapStaleRuns` in `app.ts`) | application use case called from the root | — |

Rule carried from server/INSIGHTS.md: any promise an implementation creates and doesn't await
(`EnqueuedJob.done`, a fire-and-forget launch) **must** get a `.catch` that writes the failure
to the jobs/runs row. An unhandled rejection takes down the whole API (Node ≥ 15).

## Shims and do-not-touch

- `platform/grounding.ts`, `platform/prompt.ts` are shims over reviewer-core — change logic in
  reviewer-core, not here.
- `platform/local-only.ts`, the 127.0.0.1 bind, helmet and rate-limit are security controls —
  architecture refactors must not move or weaken them.
