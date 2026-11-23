# DevDigest profile (`server/`)

Where the rings sit in this repo, which code to copy, and which violations exist today. Facts checked against `server/src` on 2026-11-23 by `grep`/`ls`; re-verify before relying on a line of this file. Repo conventions (`server/CLAUDE.md`) win over the textbook.

Contents: [Ring map](#ring-map) · [Exemplars](#exemplars-copy-these) · [Known violations](#known-violations-dont-copy-dont-fix-unasked) · [Placement cheat sheet](#placement-cheat-sheet) · [Repo rules that interact](#repo-rules-that-interact-with-layering)

## Ring map

| Ring | Where it is |
|---|---|
| **Domain (core)** | `modules/*/helpers.ts`, `modules/*/constants.ts`, `pulls/{status,cost,findings}.ts`, `reviews/findings.ts`; `@devdigest/reviewer-core` (pure review engine: diff → prompt → LLM → grounding); `platform/errors.ts` (error taxonomy); ports + contracts in `src/vendor/shared` |
| **Ports** | `src/vendor/shared/adapters.ts` (`LLMProvider`, `Embedder`, `GitHubClient`, `GitClient`, `CodeIndex`, `AuthProvider`, `SecretsProvider`), `modules/repo-intel/types.ts` (`RepoIntel` facade) |
| **Application** | `modules/*/service.ts`, `reviews/run-executor.ts`, `repo-intel/service.ts` |
| **Infrastructure** | `modules/*/repository*.ts`, `adapters/*`, `db/*`, `platform/{jobs,resilience,sse,price-book,run-logger,…}` |
| **Presentation** | `modules/*/routes.ts`, `modules/_shared/{context,schemas}.ts`, `app.ts`, `server.ts` |
| **Composition root** | `platform/container.ts` (+ `ContainerOverrides`), `modules/index.ts` (static module registry) |

Layout decision (1.0.0): rings live **inside each module** (`modules/<name>/` is a vertical slice), not in global `domain/ application/ infrastructure/` trees.

## Exemplars (copy these)

- **`modules/agents/`** — the cleanest slice: `routes.ts` (zod schemas, `getContext`, one service call per route, no Drizzle), `service.ts` (use cases, maps rows with `toAgentDto`), `repository.ts` (all Drizzle, workspace-scoped), `helpers.ts` (pure: `toAgentDto`, `toAgentVersionDto`, `isConfigChange`), `constants.ts`.
- **`ContainerOverrides` + `adapters/mocks.ts`** — every external system has a mock and a one-line override; tests (`test/routes-smoke.test.ts`, `test/integration.it.test.ts`) build the real app with fakes.
- **`modules/repo-intel/`** — consumed through the `RepoIntel` interface (`container.repoIntel`), with a degraded-mode test (`test/repo-intel-facade-degraded.test.ts`).
- **`pulls/status.ts`, `pulls/cost.ts`, `pulls/findings.ts`** — pure functions with colocated unit tests.
- **`platform/container.ts`** — shared repositories (`agentsRepo`, `reviewRepo`) built in the composition root so modules don't import each other's folders.

## Known violations (don't copy, don't fix unasked)

Listed so reviewers can tell **pre-existing** debt from **new** violations. Refactor only inside the task's scope.

1. **Fat routes with Drizzle inline.** `modules/pulls/routes.ts`, `settings/routes.ts`, `polling/routes.ts`, `workspace/routes.ts` import `drizzle-orm` and `db/schema` and query directly. `pulls/routes.ts` also calls `container.github()` and upserts PR rows in a loop inside the list handler (GitHub sync + persistence + response in one function).
2. **Schema imports outside repositories.** `reviews/run-executor.ts` and `reviews/diff-loader.ts` (`import * as schema`), `settings/feature-models.ts` (`drizzle-orm` + schema), `repos/helpers.ts` (schema). `reviews/service.ts` imports only the *type* `AgentRow` from `db/rows` (milder).
3. **Infrastructure → feature module.** `adapters/astgrep/index.ts` imports `MAX_SIGNATURE_CHARS`, `SUPPORTED_EXT` from `modules/repo-intel/constants.js`.
4. **Whole-container services.** `agents`, `repos`, `reviews`, `repo-intel` services and `run-executor` take `Container` (service locator) rather than narrow dependencies.
5. **No transactions.** There is no `db.transaction(` in `server/src`; multi-step writes (e.g. the PR upsert loop) are not atomic.
6. **Transport in the error base.** `AppError` carries an HTTP `statusCode`; `app.ts` also keeps a `ZodError` fallback for service-level `.parse`.
7. **Facade barrel exposes internals.** `modules/repo-intel/index.ts` re-exports the repository and routes with the facade, though `server/CLAUDE.md` says to consume repo-intel via the facade only.
8. **Mixed repository shapes.** `reviews/repository.ts` fronts `reviews/repository/{pull,review,run}.repo.ts`; other modules use a single `repository.ts`. Both are acceptable; pick the simpler for new modules.
9. **Pure rule inside the repository call.** `agents/repository.ts` calls `isConfigChange` itself (pure, so harmless); new code should decide in the service.

## Placement cheat sheet

| I need to… | Put it in | Not in |
|---|---|---|
| Add an endpoint | `modules/<m>/routes.ts` (zod schema + `getContext` + one service call) | a repository call or Drizzle in the handler |
| Add a business rule | pure fn in `modules/<m>/helpers.ts` (+ `*.test.ts`) | `routes.ts`, SQL `where` |
| Add a query | `modules/<m>/repository.ts`, workspace-scoped | service, route |
| Add a multi-step write | service opens `db.transaction`, repositories take `tx` | repository-per-method commits |
| Call GitHub/LLM/git/Slack | port in `vendor/shared/adapters.ts` → adapter in `adapters/<n>/` → container getter → mock | an SDK import in a service |
| Share data with another module | facade/repository exposed on `Container`, import the type | importing the other module's files |
| Add a constant | `modules/<m>/constants.ts` | inline magic values |
| Add config/secret | `AppConfig` / `SecretsProvider` | `process.env` in a service; secrets in config/DB/git |
| Test a rule / service / repo / route | domain unit / fakes via overrides / `*.it.test.ts` / `app.inject` | mocking Drizzle chains |

## Repo rules that interact with layering

- New feature = new `modules/<name>/` plugin (routes → service → repository), registered in `modules/index.ts`.
- Routes declare zod `params`/`body`; never hand-parse `req.body`; invalid input → 422 before the handler.
- Secrets only via `SecretsProvider` (`~/.devdigest/secrets.json`), never config/DB/git.
- LLM/GitHub/git are mocked via `adapters/mocks.ts`; **no keys in tests**.
- DB-backed tests must be `*.it.test.ts`.
- Findings must cite a diff line or are dropped; the score is recomputed, never trusted from the model; `INJECTION_GUARD` is the single prompt-injection defense — don't change these semantics here (reviewer-core, needs a spec).
- `platform/{grounding,prompt,structured}.ts` are re-export shims over `reviewer-core`; migrations are generated, never hand-edited.
- Context assembly lives in `reviews/run-executor.ts`; repo-intel contributes only once a repo is indexed (unindexed → silent diff-only review).
