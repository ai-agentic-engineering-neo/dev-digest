# Ports, adapters and the composition root

Every external system is reached through a **port** (interface, ring 2) implemented by an
**adapter** (ring 4). Services see only the port. *(Cockburn; Palermo)*

## Current map

| Port (ring 2) | Defined in | Adapter (ring 4) | Mock |
|---|---|---|---|
| `LLMProvider` | `vendor/shared/adapters.ts` | `adapters/llm/openai.ts`, `adapters/llm/anthropic.ts`, `OpenRouterProvider` (reviewer-core) | `MockLLMProvider` |
| `Embedder` | `vendor/shared/adapters.ts` | `adapters/embedder/openai.ts` | `MockEmbedder` |
| `GitHubClient` | `vendor/shared/adapters.ts` | `adapters/github/octokit.ts` | `MockGitHubClient` |
| `GitClient` | `vendor/shared/adapters.ts` | `adapters/git/simple-git.ts` | `MockGitClient` |
| `CodeIndex` | `vendor/shared/adapters.ts` | `adapters/codeindex/ripgrep.ts` | `MockCodeIndex` |
| `AuthProvider` | `vendor/shared/adapters.ts` | `adapters/auth/local.ts` | `MockAuthProvider` |
| `SecretsProvider` | `vendor/shared/adapters.ts` | `adapters/secrets/local.ts` (`~/.devdigest/secrets.json`) | `MockSecretsProvider` |
| `DepGraph` | `adapters/depgraph/index.ts` | `DepCruiseGraph` (dependency-cruiser) | via `ContainerOverrides.depgraph` |
| `Tokenizer` | `adapters/tokenizer/index.ts` | `TiktokenTokenizer` (js-tiktoken) | via `ContainerOverrides.tokenizer` |
| ast-grep | `adapters/astgrep/` | `@ast-grep/napi` | — |
| `RepoIntel` (internal facade) | `modules/repo-intel/types.ts` | `RepoIntelService` | via `ContainerOverrides.repoIntel` |

Mocks live in `adapters/mocks.ts`; all `ContainerOverrides` fields are in `platform/container.ts`.

## Port design rules
- **Owned by the consumer, named after the need**, not the vendor: `GitHubClient.listPullRequests(ref)`, not `octokit.rest.pulls.list`.
- **Port types are ours.** Adapters map SDK responses into port types (`PrMeta`, `UnifiedDiff`, `CompletionResult`); SDK types never leak out of `adapters/<x>/`.
- **Errors are ours.** Adapters translate SDK/network failures into `ExternalServiceError` / `ConfigError`; retries and timeouts use `platform/resilience.ts` inside the adapter.
- **Secrets are resolved at construction** in the composition root through `SecretsProvider` — services never see a key.
- **Interface-only exports** go in `adapters/<x>/index.ts` when the port isn't part of the shared contract (`Tokenizer`, `DepGraph`); the implementation class may sit next to it but services import only the type.
- Keep ports **small**. A service that needs one method of `GitHubClient` may declare `Pick<GitHubClient, 'getPullRequest'>` in its deps.

## Composition root — `platform/container.ts`
The only place that `new`s adapters, chooses an implementation, reads secrets for them and
caches them. *(Seemann)*

- Lazy getters (`get git()`, `async github()`, `async llm(id)`) + `ContainerOverrides` for tests — keep that pattern for new adapters.
- Module plugins (`routes.ts`) are local composition roots: they pull ports from the container and pass them **explicitly** into the service constructor.
- **The container must not leak into services.** `new XxxService(container)` is legacy (Service Locator: hides real dependencies, makes tests construct the world). New services take a `deps` object.

## Adding an adapter — checklist
1. Port interface (ring 2) — shared contract if the client/CI needs it, else `adapters/<x>/index.ts`.
2. Implementation `adapters/<x>/<vendor>.ts` (ring 4) — maps types and errors.
3. Mock in `adapters/mocks.ts` (+ export from `adapters/index.ts`).
4. Getter + `ContainerOverrides` field in `platform/container.ts`.
5. Unit test of the adapter's mapping (`server/test/<x>.test.ts`) with the SDK stubbed.
6. Inject the port into the services that need it.
