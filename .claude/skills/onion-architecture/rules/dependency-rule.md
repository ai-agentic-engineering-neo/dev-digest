# The Dependency Rule

> **Source code dependencies only point inward.** Outer rings may depend on inner rings; inner rings must not know about outer rings.

Every other rule in this skill falls out of this one. Enforce it and the architecture holds; break it and the layers collapse.

## What "inward" means in DevDigest

| Ring | Example files | Allowed imports |
|---|---|---|
| Domain (innermost) | `server/src/vendor/shared/**`, `server/src/modules/*/types.ts` | Zod. Standard TS/JS primitives. **No** `drizzle-orm`, **no** `fastify`, **no** `node:*`, **no** `fetch`. |
| Domain Services | `reviewer-core/src/**` | Zod. The Domain ring. Ports it declares. **No** HTTP, DB, or filesystem imports. |
| Application Services | `server/src/modules/*/service.ts` | Domain ring. Domain Services. Port interfaces (resolved via `app.container`). The `AppError` boundary type. |
| Infrastructure + Presentation (outer) | `server/src/modules/*/routes.ts`, `server/src/modules/*/repository.ts`, `server/src/adapters/**` | Anything the ring above allows, plus SDKs, Fastify, Drizzle, Octokit, `node:*`. |

## Good vs bad imports

**Good** — service depends on a port interface:

```ts
// server/src/modules/reviews/service.ts
import type { LLMProvider } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';

export class ReviewService {
  constructor(private readonly container: Container) {}

  async run(input: StartReviewInput) {
    const llm = await this.container.llm('openai'); // container resolves the port
    // ...
  }
}
```

**Bad** — service imports a concrete adapter:

```ts
// server/src/modules/reviews/service.ts
import { OpenAIProvider } from '../../adapters/llm/openai.js'; // ❌ outer ring
```

Fix: depend on `LLMProvider`; let `platform/container.ts` instantiate the concrete class.

**Bad** — domain file imports Drizzle inference:

```ts
// server/src/modules/reviews/types.ts
import type { reviews } from '../../db/schema/reviews.js'; // ❌
export type Review = typeof reviews.$inferSelect;
```

Fix: declare the domain type by hand. Let the repository map rows to it.

## In-repo exemplar

`reviewer-core/src/` is the gold standard. It:

- Imports zero outer-ring modules.
- Receives an `LLMProvider` port by argument.
- Emits no JS — it's consumed as TypeScript source via a tsconfig path alias.

When in doubt about whether a dependency points inward, open a file in `reviewer-core/src/` and check: would this import survive there? If not, it belongs further out.
