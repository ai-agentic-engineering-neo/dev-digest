# Ports & adapters — LLM SDKs, Octokit, simple-git, ripgrep, ast-grep, dependency-cruiser, tiktoken

Ports are interfaces **owned by the inside**; adapters are implementations **living outside**
([Cockburn via Graça: Ports & Adapters](https://herbertograca.com/2017/09/14/ports-adapters-architecture/)).

## Existing ports

| Port | Defined in | Adapter(s) | Container access |
|---|---|---|---|
| `LLMProvider` | `@devdigest/shared` | `adapters/llm/{openai,anthropic}.ts`, `OpenRouterProvider` (reviewer-core) | `await container.llm(id)` |
| `GitHubClient` | shared | `adapters/github/octokit.ts` (`OctokitGitHubClient`) | `await container.github()` |
| `GitClient` | shared | `adapters/git/simple-git.ts` | `container.git` |
| `CodeIndex` | shared | `adapters/codeindex/ripgrep.ts` | `container.codeIndex` |
| `Embedder` | shared | `adapters/embedder/openai.ts` | `await container.embedder()` |
| `SecretsProvider`, `AuthProvider` | shared | `adapters/secrets/local.ts`, `adapters/auth/local.ts` | `container.secrets`, `container.auth` |
| `DepGraph`, `Tokenizer` | `adapters/depgraph`, `adapters/tokenizer` (port + impl together — legacy) | `DepCruiseGraph`, `TiktokenTokenizer` | `container.depgraph`, `container.tokenizer` |
| `RepoIntel` (facade) | `modules/repo-intel/types.ts` | `RepoIntelService` | `container.repoIntel` |

## Adding a new integration — checklist

1. **Port** — interface in the consuming module's `ports.ts`; if several packages need it, in
   `@devdigest/shared` (vendor = do-not-touch → ask first). Methods speak domain language
   (`listPullRequests(repo)`), not SDK language (`octokit.rest.pulls.list`). Return port-owned types.
2. **Adapter** — `adapters/<port>/<tech>.ts`, class `<Tech><Port>`, `implements <Port>`. It may import
   the SDK, `node:*`, and domain/port types. It must **not** import `modules/*` or the container
   (rule `adapters-are-outer-ring`) — configuration comes through constructor options.
3. **Secrets** — read via `container.secrets` in the container factory, never `process.env` in the adapter.
4. **Wiring** — lazy getter (sync) or async factory (needs secrets) in `platform/container.ts`,
   plus a `ContainerOverrides` field; drop cached clients in `invalidateSecretCaches()` if key-dependent.
5. **Test double** — `Mock<Port>` in `adapters/mocks.ts`; services are tested with it.
6. **Resilience** — retries/timeouts/backoff (`platform/resilience.ts`) wrap the adapter call in the
   adapter or the container factory, not in the domain.

## Pure helpers are not adapters

Code with no I/O (diff parsing, endpoint extraction from text, pricing math) is domain/application
logic. Put it in the owning module (or `reviewer-core`), not under `adapters/`, so the core can use it
without violating `application-no-adapters`.
