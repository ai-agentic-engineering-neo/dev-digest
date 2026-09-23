# The DI container and the adapter ports

What `src/platform/container.ts` is for, and why every outbound dependency goes
through it. This is the file `server/CLAUDE.md` points at when it says
"adapters get swapped for mocks in tests".

## The shape

One `Container` per app instance. It holds the things that are genuinely
process-wide — `config`, `db`, the `JobRunner`, the SSE `runBus` — and
**lazily constructs** everything that needs a secret: the LLM providers, the
GitHub client, the embedder.

Services depend on the **interfaces** from `@devdigest/shared`
(`LLMProvider`, `GitHubClient`, `GitClient`, `CodeIndex`, `Embedder`,
`SecretsProvider`, `AuthProvider`), never on the concrete adapter classes. The
concrete choice — `OpenAIProvider`, `AnthropicProvider`, `OpenRouterProvider`,
`OctokitGitHubClient`, `SimpleGitClient`, `RipgrepCodeIndex` — is made in one
place, here.

## Why lazily

An adapter that needs an API key cannot be built at boot, because the key lives
in `SecretsProvider` (`~/.devdigest/secrets.json`, `0600`) and may not be set
yet. The studio has to start, render, and let the user enter a key — so
construction is deferred to the first call that actually needs the provider.

That's why `container.llm(id)` is `async`: it resolves a key, then builds.

## Testing: `ContainerOverrides`

The reason the container exists at all. Tests build a container with
`overrides` and inject mock implementations:

```ts
{ secrets?, auth?, github?, git?, codeIndex?, embedder?,
  llm?: Partial<Record<'openai' | 'anthropic' | 'openrouter', LLMProvider>>,
  repoIntel?, depgraph?, tokenizer? }
```

`llm` is keyed by provider id and takes **pre-built** providers, which skips
the key lookup entirely — a unit test never touches `~/.devdigest/secrets.json`
and never needs a key to exist. This is what makes `test/routes-smoke.test.ts`
and the review tests hermetic.

`repoIntel` is overridable as a whole facade, not just its pieces, so a test
can simulate the degraded path (repo not indexed) without an indexer.

## Where the LLM is actually reached

Five call sites resolve `container.llm(...)`. Knowing all five is what lets you
assert "no read endpoint calls a model":

| Site | Trigger | Network call |
|---|---|---|
| `modules/reviews/run-executor.ts:160` | `POST /pulls/:id/review` | the review completion |
| `modules/settings/routes.ts:91` | `POST /settings/test-connection` | `listModels()` — a user-initiated key test |
| `modules/agents/service.ts:179` | agent editor model dropdown | `listModels()`, wrapped in `try/catch → []` |
| `platform/container.ts:205` | `embedder()` | embeddings; throws before constructing when `EMBEDDINGS_ENABLED=false` |
| `platform/price-book.ts` | price refresh | OpenRouter model list |

None of them sit on a GET. Every read route (`/repos/:id/pulls`,
`/pulls/:id/reviews`, `/pulls/:id/runs`, `/runs/:id/trace`) is DB-only.

## Cost estimation is wired in here

`estimateCost` (static table) and `PriceBook` (live OpenRouter prices) are both
constructed in the container and handed to the providers, so every adapter
attaches `costUsd` to its result the same way. See
[../specs/run-cost.md](../specs/run-cost.md).

## Adding an adapter

1. Define the port as an interface in `src/vendor/shared/adapters.ts` — the
   contract, not the implementation.
2. Implement it in `src/adapters/<kind>/<impl>.ts`.
3. Construct it in the container; if it needs a secret, construct it lazily.
4. Add it to `ContainerOverrides` so tests can replace it.

Skipping step 4 is the common mistake: the code works, and then every test
touching that path needs real credentials.

## Feature flags that change what gets built

- `EMBEDDINGS_ENABLED=false` (default) — `embedder()` throws before
  constructing the OpenAI client, so a default install makes zero OpenAI
  requests.
- `REPO_INTEL_ENABLED=true` (default) — but the repo map stays empty until the
  repo is indexed, which is a **silent degrade to diff-only review**, not an
  error. See `server/CLAUDE.md` gotchas.
