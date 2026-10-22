# Ports, adapters and the composition root

**Port** = an interface owned by an inner ring that describes what the core needs from the outside
world. **Adapter** = an outer-ring class that implements it with a real SDK. The core depends on
the port; the composition root decides which adapter to plug in.

## In DevDigest

| Port (ring 2) | Adapter (ring 4) | Mock | Container access |
|---|---|---|---|
| `LLMProvider` | `adapters/llm/openai.ts`, `adapters/llm/anthropic.ts`, `OpenRouterProvider` (reviewer-core) | `MockLLMProvider` | `await container.llm(id)` |
| `GitHubClient` | `adapters/github/octokit.ts` | `MockGitHubClient` | `await container.github()` |
| `GitClient` | `adapters/git/simple-git.ts` | `MockGitClient` | `container.git` |
| `CodeIndex` | `adapters/codeindex/ripgrep.ts` | `MockCodeIndex` | `container.codeIndex` |
| `Embedder` | `adapters/embedder/openai.ts` | `MockEmbedder` | `await container.embedder()` |
| `SecretsProvider` | `adapters/secrets/local.ts` | `MockSecretsProvider` | `container.secrets` |
| `AuthProvider` | `adapters/auth/local.ts` | `MockAuthProvider` | `container.auth` |
| `RepoIntel` (facade) | `modules/repo-intel/service.ts` | injected via overrides | `container.repoIntel` |
| `DepGraph`, `Tokenizer` | `adapters/depgraph`, `adapters/tokenizer` | injected via overrides | `container.depgraph`, `container.tokenizer` |

Port interfaces live in `server/src/vendor/shared/adapters.ts` (mirror to `client/src/vendor/shared`
if the client ever imports it). Mocks live in `server/src/adapters/mocks.ts`.

## Adding a new external system — the checklist

1. **Port** — declare the interface in `@devdigest/shared` in domain terms (`listPullRequests(repo)`,
   not `octokit.rest.pulls.list`). Inputs/outputs are contract types, never SDK types.
2. **Adapter** — `adapters/<system>/<impl>.ts` implements the port. It is the only file that imports
   the SDK. It catches SDK/network errors and throws `ExternalServiceError` (wrap retries with
   `platform/resilience.ts`).
3. **Mock** — deterministic implementation in `adapters/mocks.ts`.
4. **Container** — lazy getter in `platform/container.ts` + optional field in `ContainerOverrides`.
   Credentials come from `SecretsProvider`, config from `AppConfig`.
5. **Use** — services call `this.container.<port>`; they never `new` the adapter.
6. **Test** — `buildApp({ config, overrides: { <port>: new MockX() } })` or construct the service
   with a test container.

## Composition root rules

- `platform/container.ts` is the **only** place adapters and shared repositories are constructed.
- Getters are lazy and cached (`this._x ??= new X(...)`), and check `overrides` first.
- No business logic in the container — just wiring.
- Prefer passing the narrowest dependency: a new class that needs only `GitClient` should take a
  `GitClient` in its constructor, not the whole `Container` (existing services take `Container`;
  that's accepted, but don't widen it further).

## Sources

- Jeffrey Palermo — [The Onion Architecture: part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/)
- Alistair Cockburn — [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/)
- Mark Seemann — [Composition Root](https://blog.ploeh.dk/2011/07/28/CompositionRoot/)
- [Hexagonal Architecture (Ports and Adapters) in TypeScript](https://www.matthewswong.com/en/blog/hexagonal-architecture-ports-and-adapters/)
- [kroneman/hexagonal-architecture-ts](https://github.com/kroneman/hexagonal-architecture-ts)
