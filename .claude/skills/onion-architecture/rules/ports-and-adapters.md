# Ports and adapters

The DevDigest DI container is the practical application of ports-and-adapters.

## Definitions

- **Port** — an interface declared by an inner layer, naming what it needs without saying how.
- **Adapter** — an outer-ring class that implements a port against a real SDK, driver, or network.

Ports live inward; adapters live outward. The composition root wires them together.

## Ports in this repo

Declared in `server/src/platform/container.ts` and `@devdigest/shared`:

| Port | Role | Default adapter |
|---|---|---|
| `LLMProvider` | LLM completions (model-agnostic) | `OpenAIProvider`, `AnthropicProvider`, `OpenRouterProvider` |
| `GitHubClient` | GitHub API (PRs, repos, comments) | `OctokitGitHubClient` |
| `GitClient` | Local git (clone, diff, log) | `SimpleGitClient` |
| `SecretsProvider` | Read API keys / tokens | `LocalSecretsProvider` (from `~/.devdigest/secrets.json`) |
| `AuthProvider` | Request auth context | `LocalNoAuthProvider` |
| `CodeIndex` | Fast code search | `RipgrepCodeIndex` |
| `Embedder` | Vector embeddings | `OpenAIEmbedder` |
| `DepGraph` | Dependency analysis | `DepCruiseGraph` |
| `Tokenizer` | Token counting | `TiktokenTokenizer` |

For each port, mocks live in `server/src/adapters/mocks.ts` (`MockLLMProvider`, `MockGitHubClient`, `MockGitClient`, …). Unit tests inject these via `ContainerOverrides`.

## The composition root

Two files, and only two, instantiate concrete adapters:

- `server/src/platform/container.ts` — the `Container` class with lazy getters per port.
- `server/src/modules/index.ts` — static module registry.

Everything else goes through `app.container`. Services do not call `new OpenAIProvider()` directly. Routes do not call `new ReviewRepository()` directly.

## The DI pattern

Real wiring (production):

```ts
const app = await buildApp();
// app.container.llm('openai') returns OpenAIProvider wired to the real key
```

Test wiring (hermetic):

```ts
const app = await buildApp({
  overrides: {
    llm: { openai: new MockLLMProvider() },
    github: new MockGitHubClient(),
  },
});
// app.container.llm('openai') now returns MockLLMProvider
```

`ContainerOverrides` is defined at `server/src/platform/container.ts:40`. If you add a new port, extend this interface so tests can mock it.

## Rules

1. **Interfaces live inward.** Define the port next to the code that consumes it, or in `platform/container.ts` if cross-cutting.
2. **Only the composition root instantiates adapters.** If you type `new SomeAdapter()` outside `platform/container.ts` or `modules/index.ts`, you're probably off the path.
3. **Mocks implement the same port.** A mock in `adapters/mocks.ts` that drifts from its interface is a bug.
4. **Adapters throw domain errors, not framework errors.** An adapter returning `httpErrors.notFound()` couples infrastructure to Fastify — throw `AppError` instead.
