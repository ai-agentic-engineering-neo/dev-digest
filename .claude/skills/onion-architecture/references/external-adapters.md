# External systems: LLM, GitHub, git, embeddings, code index

Every external system is reached through a **port** the application owns and
an **adapter** in `src/adapters/<system>/` that implements it. This is the
original Hexagonal idea (Cockburn): the app doesn't know whether it talks to
OpenAI, a mock, or a test fake.

## Where things are today

| Port (interface) | Declared in | Adapters | Container accessor |
|------------------|-------------|----------|--------------------|
| `LLMProvider` | `vendor/shared/adapters.ts` | `adapters/llm/{openai,anthropic}.ts`, `OpenRouterProvider` (reviewer-core) | `await container.llm(id)` |
| `GitHubClient` | `vendor/shared/adapters.ts` | `adapters/github/octokit.ts` | `await container.github()` |
| `GitClient` | `vendor/shared/adapters.ts` | `adapters/git/simple-git.ts` | `container.git` |
| `CodeIndex` | `vendor/shared/adapters.ts` | `adapters/codeindex/ripgrep.ts` | `container.codeIndex` |
| `Embedder` | `vendor/shared/adapters.ts` | `adapters/embedder/openai.ts` | `await container.embedder()` |
| `SecretsProvider`, `AuthProvider` | `vendor/shared/adapters.ts` | `adapters/secrets/local.ts`, `adapters/auth/local.ts` | `container.secrets`, `container.auth` |
| `DepGraph`, `Tokenizer` | `adapters/depgraph`, `adapters/tokenizer` (legacy: port next to impl) | same files | `container.depgraph`, `container.tokenizer` |

Mocks for all of them: `src/adapters/mocks.ts`.

## Rules

1. **Modules import ports, never concretions** (`modules-no-concrete-adapters`).
   Only `platform/container.ts` (and `compose.ts`) construct adapters.
2. **Adapters don't import modules or the Container** (`adapters-know-no-modules`).
   If an adapter needs a constant from a module, the constant belongs to the
   port's side (vendor/shared or a neutral constants file). Legacy:
   `adapters/{astgrep,depgraph}` → `repo-intel/constants.ts`.
3. **Anti-corruption mapping in the adapter.** Map SDK responses (Octokit,
   OpenAI) to port types inside the adapter; no SDK types leak into services.
   Wrap SDK failures in `ExternalServiceError` (or a port-level error) there.
4. **Secrets only via `SecretsProvider`**, resolved in the container/adapter
   (`~/.devdigest/secrets.json`) — never in services, DB, git or `.env`
   (root CLAUDE.md).
5. **Pure helpers are not adapters.** Functions like `parseUnifiedDiff`,
   `extract` (codeindex) or ast-grep queries that are pure transforms can be
   used by modules — but then they belong in a neutral place
   (`modules/_shared/` or reviewer-core), not under `src/adapters/`. Legacy
   imports of those from modules are baselined; when touching, prefer to call
   them through the port or move them.
6. **Ports shared across packages** (server ↔ client ↔ reviewer-core) live in
   `vendor/shared/adapters.ts` — both copies. A port used by one module lives
   in that module's `ports.ts`.
7. **Review-engine logic belongs in reviewer-core**; `platform/{grounding,prompt,structured}.ts`
   are re-export shims (server CLAUDE.md). Never weaken `INJECTION_GUARD` or the
   grounding gate.
8. **Resilience at the edge.** Retries/timeouts/backoff (`platform/resilience.ts`,
   `p-queue`) wrap adapter calls; the service decides what a failure *means*
   (degrade, fail the run, skip).

## Adding a new external system — steps

1. Write the port from the use case's point of view (`ports.ts` or vendor/shared ×2).
2. Implement `src/adapters/<system>/<impl>.ts` with SDK → port mapping.
3. Add a mock to `src/adapters/mocks.ts`.
4. Add a lazy getter + `ContainerOverrides` field in `platform/container.ts`;
   resolve any key via `SecretsProvider` there.
5. Inject into the service from `compose.ts`.
6. Unit-test the service with the mock; test the adapter with a recorded or
   local fake, never a live paid API in CI.
