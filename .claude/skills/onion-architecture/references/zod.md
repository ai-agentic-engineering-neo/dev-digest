# Zod = the gate at every edge

"Parse, don't validate" (Alexis King): turn untrusted input into a trusted type once, at the boundary; inner code takes the typed value and never re-checks it.

## Edges that must parse
| Edge | Where | How |
|---|---|---|
| HTTP body/params/query | `routes.ts` | `schema: { body: X }` via `fastify-type-provider-zod` |
| HTTP response | `routes.ts` | `toXxxDto(domain)` typed as the shared contract (optionally `schema.response`) |
| Job payload read back from `jobs` table | job handler in `infrastructure/` | `Payload.parse(raw)` — never `raw as Payload`; persisted rows may be from an older version |
| GitHub / LLM / SDK responses | `src/adapters/**` | parse the subset you use, map to the port's return type |
| LLM structured output | `LLMProvider.structured` + reviewer-core | schema passed in, result already parsed |
| Env / config | `platform/config.ts` (`loadConfig`) | the only `process.env` reader |

## DTO ≠ entity
- `@devdigest/shared` contracts describe the **wire format**. They're for `routes.ts`, the client and adapters.
- Entities in `domain-model/` are plain TS types/classes owned by the module; mapping DTO ↔ entity sits in `routes.ts` (or a `*.dto.ts` next to it).
- Exception: enum-like types (`Severity`, run status unions) may be `import type`d from shared — they are vocabulary, not format.
- Don't add Zod to `domain-model/`. A value object enforces invariants with a constructor/factory returning a typed value or throwing `ValidationError`.

## Don't
- Re-`parse` the same data in the use case after the route parsed it.
- Reshape an existing shared contract to fit the domain — add a new contract file (server AGENTS.md rule).
- Rely on `instanceof ZodError` (duplicate zod instances; `app.ts` matches by shape on purpose).
