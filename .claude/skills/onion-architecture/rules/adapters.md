# Adapters — every external system is behind a port

Ports (interfaces owned by the inner rings) live in `src/vendor/shared/adapters.ts`; adapters (implementations) live in `src/adapters/**`. This is Ports & Adapters/Hexagonal fused into the Onion: the inner rings **define** what they need; the edge **provides** it.

## Port ↔ adapter map (today)

| Port (`@devdigest/shared` / module `types.ts`) | Adapter (`src/adapters/**`) | SDK / tool |
|---|---|---|
| `LLMProvider` | `llm/openai.ts`, `llm/anthropic.ts`, `OpenRouterProvider` (in `reviewer-core`) | `openai`, `@anthropic-ai/sdk`, OpenRouter |
| `Embedder` | `embedder/openai.ts` | `openai` |
| `GitHubClient` | `github/octokit.ts` | `octokit` |
| `GitClient` | `git/simple-git.ts` (+ `git/diff-parser.ts`) | `simple-git` |
| `CodeIndex` | `codeindex/ripgrep.ts` | `@vscode/ripgrep` |
| `RepoIntel` (`repo-intel/types.ts`) | `modules/repo-intel/service.ts` facade | ast-grep (`astgrep/`), `depgraph/`, `tokenizer/` |
| `SecretsProvider` / `AuthProvider` | `secrets/local.ts`, `auth/local.ts` | `~/.devdigest/secrets.json` |
| (future) `DepGraph`, `Tokenizer` ports | `depgraph/`, `tokenizer/` | `dependency-cruiser` (library), `js-tiktoken` |

## Rules

1. **Port first.** Before adding an SDK call, add/extend the port in domain vocabulary (`listPullRequests(repo): PrMeta[]`), not SDK vocabulary (`octokit.rest.pulls.list`).
2. **Adapter = translator.** It owns protocol concerns (auth, retries, pagination, rate limits, `resilience.ts`), and **maps SDK types ↔ domain types** in one place. SDK types must not appear in a port signature or escape the adapter file(s).
3. **Adapters never import `modules/**`, `platform/container`, or `db/seed`** (`adapters-no-modules`). If two sides need a constant (today `repo-intel/constants` is imported by `adapters/astgrep` and `adapters/depgraph`), move it to a neutral location (`adapters/` or `vendor/shared`).
4. **Application services never import a concrete adapter** (`inner-no-outer`). `repo-intel/service.ts` and `pipeline/*` importing `adapters/astgrep|codeindex|tokenizer` directly is tracked debt — introduce ports (`AstIndexer`, `Tokenizer`, `DepGraph`) in `repo-intel/types.ts` and inject them.
5. **Secrets only via `SecretsProvider`.** Adapters receive keys/tokens from the Container factory (`llm(id)`, `github()`); they never read env/files. After a secret changes, call `container.invalidateSecretCaches()`.
6. **Errors:** adapters translate SDK failures into `ExternalServiceError`/`ConfigError`; no raw SDK error escapes into services.
7. **Every port has a mock** in `adapters/mocks.ts` and a `ContainerOverrides` slot. Unit tests inject the mock; no test hits the network.
8. **Local-first degradation is a service decision.** Adapters throw; the *service* decides to serve persisted data when GitHub is unavailable (`pulls` does this in the route today — move to the service).
9. **`reviewer-core` is a library ring 1–3 unit.** The server calls `reviewPullRequest({ …, llm })` with an injected `LLMProvider`; it never gets `db`, GitHub or fs. Keep `platform/{grounding,prompt,structured}.ts` as thin re-exports.
10. **Jobs / SSE (`p-queue` JobRunner, `runBus`)** are infrastructure. Services depend on a tiny `jobs.enqueue(...)` / `bus.publish(...)` port (`platform-di.md`).

## Sources

Microsoft, [Anti-Corruption Layer pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/anti-corruption-layer) · Alistair Cockburn, [Hexagonal (Ports & Adapters)](https://alistair.cockburn.us/hexagonal-architecture/) · Palermo, [The Onion Architecture](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/).
