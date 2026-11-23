# Adapters and ports

Contents: [The pattern](#the-pattern) · [Existing ports](#existing-ports-and-adapters) · [Adding an integration](#adding-an-external-integration-checklist) · [Container and overrides](#container-and-overrides) · [Jobs and long-running work](#jobs-and-long-running-work) · [Cross-module access](#cross-module-access) · [Anti-patterns](#anti-patterns)

`server/CLAUDE.md`: *"Reach the outside world only through adapters via `platform/container.ts`."* This file is how to do that correctly.

## The pattern

```
service.ts ──uses──▶ Port (interface, inner ring)  ◀──implements── Adapter (adapters/<name>/, outer ring)
                                                                         │ imports the SDK
platform/container.ts ── picks which Adapter instance satisfies the Port (real or override)
```
- **The port is owned by the core** and shaped by what the core needs. Name methods by intent (`listPullRequests`, `completeStructured`), return domain/contract types, never SDK types. [H1][H2][K1]
- **The adapter is the only file family that imports the SDK** (`octokit`, `openai`, `@anthropic-ai/sdk`, `simple-git`, `@ast-grep/napi`, `js-tiktoken`, `dependency-cruiser`, `@vscode/ripgrep`). It translates vendor errors to the shared taxonomy and parses untrusted payloads (zod) before returning. [Z2][O4]
- **The container is the only place that names concrete classes.** [O2][H2]

## Existing ports and adapters

| Port (interface) | Real adapter | Mock (`adapters/mocks.ts`) |
|---|---|---|
| `LLMProvider` | `adapters/llm/{openai,anthropic}.ts`, `OpenRouterProvider` (from `@devdigest/reviewer-core`) | `MockLLMProvider` |
| `Embedder` | `adapters/embedder/openai.ts` | `MockEmbedder` |
| `GitHubClient` | `adapters/github/octokit.ts` | `MockGitHubClient` |
| `GitClient` | `adapters/git/simple-git.ts` | `MockGitClient` |
| `CodeIndex` | `adapters/codeindex/ripgrep.ts` | `MockCodeIndex` |
| `AuthProvider` | `adapters/auth/local.ts` (no-auth MVP) | `MockAuthProvider` |
| `SecretsProvider` | `adapters/secrets/local.ts` (`~/.devdigest/secrets.json`) | `MockSecretsProvider` |
| `RepoIntel` (facade) | `modules/repo-intel/service.ts` (`RepoIntelService`) | injected via `ContainerOverrides.repoIntel` |
| `DepGraph`, `Tokenizer` | `adapters/depgraph`, `adapters/tokenizer` | via overrides |

Interfaces live in `server/src/vendor/shared/adapters.ts` (the `@devdigest/shared` port file — server-side in practice because the client copy has drifted).

## Adding an external integration (checklist)

For e.g. a Slack notifier, a new LLM vendor, a new VCS:

1. **Define the port** in `vendor/shared/adapters.ts`: a small interface in the core's language (`NotificationSink.postReviewSummary(summary)`), plus any input/output types as zod-inferred contracts. Diff `client/src/vendor/shared` first; only mirror there if the client needs it.
2. **Write the adapter** in `adapters/<name>/…`: the only place importing the SDK. Read secrets via `SecretsProvider`, never `process.env` or config files. Parse inbound data; wrap vendor errors (`ExternalServiceError`).
3. **Add a mock** to `adapters/mocks.ts` (`MockNotificationSink` recording calls) so tests need no keys or network.
4. **Wire it in `platform/container.ts`**: a lazy getter that returns `overrides.<name>` if given, else constructs the real adapter; add the field to `ContainerOverrides`.
5. **Use it from a service** through the container (`this.container.notifications`), never `new SlackClient()`.
6. **Test**: application test with the mock override (assert calls); adapter test against recorded/faked HTTP, not live.
7. Add resilience where the call is flaky/slow: `platform/resilience.ts` (`withTimeout`, `withRetry`) around the adapter call, not inside domain code.

## Container and overrides

`Container` holds `config`, `db`, `secrets`, `auth`, `jobs`, `runBus`, lazy adapter getters, and shared repositories (`agentsRepo`, `reviewRepo`). It is exposed as `app.container` and constructed in `buildApp({ config, overrides })`. Tests pass `overrides` with mocks, which is the whole reason the rings pay off: [O1b]

```ts
const app = await buildApp({ config, overrides: { github: new MockGitHubClient({ login: 'octocat' }) } });
const res = await app.inject({ method: 'POST', url: '/settings/test-connection', payload: { provider: 'github' } });
```

Known compromise: services take the **whole `Container`** (`new AgentsService(container)`). That is a service locator — convenient, but the application ring then transitively reaches every concrete adapter. For new code, prefer to declare the narrow dependencies a service needs (`Pick<Container, 'github' | 'reviewRepo'>`, or constructor parameters typed with ports) so tests build it with two fakes instead of a container. [O1b]

## Jobs and long-running work

- `platform/jobs.ts` (`JobRunner`, `p-queue` + `jobs` table, timeouts/retry) is **infrastructure**. Services enqueue by kind through the container; handlers registered for each kind call **services**, not the other way round.
- Long use cases (`reviews/run-executor.ts`) are application-ring orchestrators: they call ports and repositories, publish progress to `runBus`, and persist. They must not reach for `fastify`, `reply` or `app.log` directly; accept a logger interface (the file already defines a `Logger` type).
- SSE subscription is presentation (see `fastify-presentation.md`); the executor only publishes events.

## Cross-module access

One module must not import another module's internals. The model is `repo-intel`: other modules consume the **`RepoIntel` interface** via `container.repoIntel`, never `RepoIntelRepository`. Shared entity repositories are constructed in the container (`container.agentsRepo`, `container.reviewRepo`) "so consuming modules use `container.agentsRepo` instead of reaching into another module's folder" (comment in `platform/container.ts`). Follow that: expose a facade or repository through the container, and import only its type.

(Note: `modules/repo-intel/index.ts` currently re-exports the repository and routes along with the facade. `server/CLAUDE.md` says consume repo-intel through its facade only — honor the rule even though the barrel exposes more.)

## Anti-patterns

- `import { Octokit } from 'octokit'` / `new OpenAI()` outside `adapters/` (and the container).
- A port that mirrors the SDK (`getOctokitPullResponse`) — swapping vendors would change the core.
- `process.env.X` in a service or adapter — go through `AppConfig` / `SecretsProvider`.
- `adapters/*` importing from `modules/*` (today: `adapters/astgrep/index.ts` imports `modules/repo-intel/constants.js`). Move the shared constant down into the adapter or into `@devdigest/shared`.
- A new adapter without a mock/override: untestable without keys.
- Real network/LLM calls in tests. Keys must never be required.
