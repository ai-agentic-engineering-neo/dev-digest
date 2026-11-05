# Zod — validation at the edges

Types can't guarantee data that arrives from outside, so **parse at every boundary, then trust the
types inside** ([kamae-ts: Boundary Defense](https://iwasa-kosui.github.io/kamae-ts/en/boundary-defense.html)).

## Where Zod runs (inbound edges)

| Edge | Where | How |
|---|---|---|
| HTTP request | `routes.ts` | `schema: { params, querystring, body }` via `fastify-type-provider-zod` |
| LLM output | adapter / `reviewer-core` structured output | parse against the contract, degrade gracefully on failure |
| JSON columns from DB | repository mapper | `Contract.parse(row.jsonCol)` |
| Env / config | `platform/config.ts` | parse once at boot |
| External API payloads (GitHub, OpenRouter) | adapter | map SDK types → port types |

Inner rings (domain, application) **don't re-parse** already-typed values.

## Where types live

- **API contracts / DTOs**: `@devdigest/shared` (`export const X = z.object(…)` + `export type X = z.infer<…>`).
  Used by presentation and application. Do not edit the vendor copy without coordination.
- **Domain (`domain.ts`, `ports.ts`)**: plain TypeScript. Contracts may be referenced **only with
  `import type`** — no Zod runtime in the core (enforced by `domain-shared-type-only`). Invariants are
  plain guard functions that throw `AppError` subclasses.
- A domain type that is identical to a contract may simply alias it: `export type ReviewStrategy = Shared.ReviewStrategy`.
  Introduce a separate domain type when the shape differs (camelCase, extra invariants, no transport fields).

## Errors

A `ZodError` escaping a service is rendered as 422 `validation_error` by the global handler — fine for
edge parsing in services (e.g. parsing an LLM result). Don't use Zod for business invariants; throw
a named `AppError` instead (`invalid_run_request`).

## References
- [kamae-ts — Boundary Defense](https://iwasa-kosui.github.io/kamae-ts/en/boundary-defense.html)
- Tool-level detail: `.claude/skills/zod/`
