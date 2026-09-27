---
name: domain-purity
description: What the core may not import, and how new capability reaches it
metadata:
  tags: domain, purity, reviewer-core, side-effects, testability
---

# Domain purity

The innermost rings — `reviewer-core/src` and `server/src/domain/**` — are the part of
the system that outlives the stack. They stay free of side effects and of every
implementation detail: no persistence, no transport, no environment.

## Forbidden imports in the core

`fastify` · `drizzle-orm` · `postgres` · `octokit` · `simple-git` · `openai` ·
`@anthropic-ai/sdk` · `@ast-grep/napi` · any `node:` builtin (`node:fs`, `node:path`,
`node:child_process`) · `process.env` · `Date.now()` and `Math.random()` when the result
is part of an outcome.

Non-determinism is a dependency too. If a rule needs the current time or an id, take a
`clock` or `idGenerator` port — that is what makes the rule assertable.

## New capability arrives as a port

`reviewer-core` already states the rule: "new outside capability arrives as an injected
port, never as an import". Its only side effect is an LLM call through an injected
`LLMProvider`, and that single decision is what makes the whole package mock-testable.

```ts
// GOOD — the engine asks for a capability it cannot perform itself
export async function runReview(input: ReviewInput, deps: { llm: LLMProvider }): Promise<ReviewOutcome>
```

```ts
// BAD — the core reached out and took one
import OpenAI from 'openai';
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
```

## Rules live in the core, not in helpers of a service

Grounding, severity, score recomputation, prompt assembly — these are domain services.
They are pure, they are unit-tested without infrastructure, and they are the reason the
engine can be reasoned about at all. A new rule that ends up in `service.ts` because
"it was easier there" is a rule that will be re-implemented differently somewhere else.

Concretely, in this codebase: a finding that does not cite a real line in the diff is
dropped and the score is recomputed from the survivors. That is domain logic and it
lives in `reviewer-core/src/grounding.ts` — not in the route, not in the repository.

## Purity is a testing property

The check is simple: **can this run in a test with no Docker, no network, no clock and
no filesystem?** If not, something outside leaked in. That question is also what the
`*.it.test.ts` suffix encodes — a test that needs Postgres is testing an adapter, by
definition.
