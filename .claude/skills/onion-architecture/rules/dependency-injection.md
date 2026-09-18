# Dependency injection: wiring ports to adapters

Onion Architecture only works if something, somewhere, decides which concrete adapter satisfies which port. In this repo that's `server/src/platform/container.ts` — a single DI container built once per app instance.

## Reference: `Container`

```ts
// server/src/platform/container.ts
import type {
  AuthProvider, SecretsProvider, CodeHostClient, RepoProvider,
  GitClient, CodeIndex, Embedder, LLMProvider,
} from '@devdigest/shared';                        // ← the PORTS
import { LocalSecretsProvider } from '../adapters/secrets/local.js';
import { OctokitGitHubClient } from '../adapters/github/octokit.js';
import { GitLabClient } from '../adapters/gitlab/rest.js';
import { OpenAIProvider } from '../adapters/llm/openai.js';
import { AnthropicProvider } from '../adapters/llm/anthropic.js';
import { OpenRouterProvider } from '@devdigest/reviewer-core';  // ← the ADAPTERS

/**
 * DI container. One per app instance. Holds config, db, the JobRunner,
 * the SSE bus, and lazily-constructed adapters resolved through SecretsProvider.
 *
 * Tests construct a container with `overrides` to inject mock adapters; the
 * Services depend on these interfaces, not the concrete classes.
 */
export interface ContainerOverrides {
  secrets?: SecretsProvider;
  auth?: AuthProvider;
  github?: CodeHostClient;
  gitlab?: CodeHostClient;
  git?: GitClient;
  codeIndex?: CodeIndex;
  embedder?: Embedder;
  llm?: Partial<Record<'openai' | 'anthropic' | 'openrouter', LLMProvider>>;
  // ...
}
```

This is the whole pattern: import ports at the top (from `@devdigest/shared`), import adapters below them (from `adapters/*`), and let `Container` be the one file in the whole codebase that's allowed to know both sides. Every `service.ts` takes the `Container` (or the specific piece it needs off it) and never imports an adapter class directly — that's what `application-layer.md`'s `ReviewService` example demonstrates.

## Why `ContainerOverrides` exists

The doc-comment says it plainly: *"Tests construct a container with `overrides` to inject mock adapters; the Services depend on these interfaces, not the concrete classes."* This is the payoff of the whole architecture — a hermetic test for `ReviewService` can hand it a `Container` built with a fake `LLMProvider` (`llm: { openrouter: stubProvider }`) instead of a real OpenRouter client, and `ReviewService` behaves identically because it only ever called the interface. No network, no API key, no flakiness. See [testing-strategy.md](testing-strategy.md).

## When you add a new port + adapter pair

1. Define the interface in `server/src/vendor/shared/adapters.ts` (the port belongs with the others, framework-agnostic).
2. Implement it in a new file under `server/src/adapters/<name>/`.
3. Add it to `ContainerOverrides` and wire its default construction into `Container`.
4. `service.ts` files that need it take it from `container`, never `import { YourAdapter } from '../../adapters/...'` directly.

## `reviewer-core`'s lighter-weight DI

`reviewer-core` doesn't need a container — it has exactly one port (`LLMProvider`) and passes it as a single field on `ReviewInput`:

```ts
export interface ReviewInput {
  // ...
  llm: LLMProvider;   // constructor-injection's simplest form: a function argument
}
```

This is still dependency injection — just scaled to the package's actual complexity. Don't introduce a container-style abstraction in `reviewer-core` for one port; do use `server`'s container pattern once a module needs more than one or two.

Further reading:
- [Implementing SOLID and the Onion Architecture in Node.js with TypeScript and InversifyJS — DEV Community](https://dev.to/remojansen/implementing-the-onion-architecture-in-nodejs-with-typescript-and-inversifyjs-10ad) (a heavier, decorator-based DI approach — useful for contrast, not a recommendation to adopt InversifyJS here; this repo's plain-object container is intentionally lighter-weight)
