# Zod 3.25 — parse at the boundary, trust inside

Zod is a **boundary tool**. The core works with types that are already proven valid.
Principle: "Parse, don't validate" (Alexis King) — turn untrusted input into a precise type
once, where it enters, instead of re-checking it all over the core. For Zod API usage see skill `zod`.
Stay on Zod 3 (root CLAUDE.md: Zod 3.25, not v4).

## Where untrusted data enters — and who parses it

| Entry point | Parsed in | With |
|---|---|---|
| HTTP request params/query/body | `http/schemas.ts`, attached to the route `schema` | fastify-type-provider-zod |
| HTTP response (our own output) | route `schema.response` | serializer compiler (guards against leaking extra fields) |
| jsonb / loosely-typed DB columns | `infrastructure/mappers.ts` | contract schema (e.g. `AgentVersionConfig.parse`) |
| LLM structured output | `reviewer-core/src/llm/structured.ts` | Zod → JSON Schema + repair |
| GitHub / SDK responses we don't fully trust | `src/adapters/<name>/` | adapter-local schema or explicit mapping |
| env / config | `platform/config.ts` | config schema |
| `~/.devdigest/secrets.json` | `adapters/secrets/local.ts` | (never log the values) |

After that point, functions take typed values and **do not call `.parse` again**.

## Domain types are plain TypeScript

```ts
// modules/agents/domain/types.ts
import type { Provider, ReviewStrategy, CiFailOn } from '@devdigest/shared'; // type-only reuse of vocab
export type AgentId = string & { readonly __brand: 'AgentId' };
export interface Agent {
  id: AgentId; workspaceId: WorkspaceId; name: string; provider: Provider; model: string;
  systemPrompt: string; strategy: ReviewStrategy; ciFailOn: CiFailOn; repoIntel: boolean;
  enabled: boolean; version: number;
}
```

- No `import { z } from 'zod'` in `domain/` (decision Q3: domain never runs Zod).
- Invariants that must hold for every instance (non-empty name, positive version) are enforced
  by a factory/policy in `domain/` with plain code, and by the HTTP schema at the edge.
- Branded ids are optional; use them where mixing ids is a real risk (agent vs run vs PR).

## Contracts vs domain

`@devdigest/shared` contracts (`vendor/shared/contracts/*`) describe the **API**, in
`snake_case`, shared with the client. They change when the UI needs change. The domain changes
when business rules change. Keep them separate:

- `http/presenter.ts`: `presentAgent(a: Agent): AgentDto` (domain → contract).
- `http/` command mapping: `toUpdateAgentCommand(body): AgentPatch` (contract → domain input).
- Changing a contract → update **both** copies (`server/src/vendor/shared` and
  `client/src/vendor/shared`); reviewer-core reads the server copy.

## Errors

- A failed parse at the HTTP edge is handled by `app.ts` (`hasZodFastifySchemaValidationErrors` → 422).
- A failed parse in a mapper means **our own stored data is corrupt** — let it throw (500 + log),
  don't convert it into a validation error for the user.
- Don't use Zod errors as business errors; throw a `DomainError`.
