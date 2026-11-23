# zod at the boundaries

Contents: [Principle](#principle) · [Where to parse](#where-to-parse) · [Contracts in vendor/shared](#contracts-live-in-vendorshared) · [Transport vs domain types](#transport-types-vs-domain-types) · [Anti-patterns](#anti-patterns)

zod API details are in the `zod` skill. This is about **where** parsing happens and **which types** cross which boundary.

## Principle

*Parse, don't validate.* Turn untrusted, loosely-typed input into a precise type **once, at the boundary**, and from then on pass the precise type; don't re-check it in every function ("shotgun parsing"). [Z2][Z1]

Corollary for rings: the **edge** (presentation and adapters) is where untrusted data arrives, so that's where schemas run. The **core** receives already-parsed values and trusts its types.

## Where to parse

| Boundary | Parse with | Notes |
|---|---|---|
| HTTP request (`params`, `body`, `querystring`) | zod in the route `schema` via `fastify-type-provider-zod` | Failure → 422 before the handler. [Z3] |
| HTTP response | zod `response` schema | Failure is a server bug → logged, generic 500 (see `app.ts`). |
| External API payloads (GitHub, LLM output) | zod in the **adapter** that reads them | The adapter returns port-typed values; the core never sees raw vendor JSON. LLM structured output is parsed in `reviewer-core`/the LLM adapter. |
| Environment/config | `loadConfig` (`platform/config.ts`) | Validate at boot, inject `AppConfig`; don't read `process.env` in services. |
| Database rows | Usually not re-parsed | Drizzle types are trusted; parse only JSON columns whose shape isn't enforced by the schema. |

Inside services/domain: **no** `schema.parse(...)` on data that already came through a boundary. `app.ts` still has a fallback for a `ZodError` thrown from service-level parsing — it exists for legacy paths, not as a pattern to expand.

## Contracts live in `vendor/shared`

`@devdigest/shared` (`server/src/vendor/shared`) holds the zod schemas and inferred types for API contracts, plus the port interfaces in `adapters.ts`. [Z1]
- A contract is **one schema, used twice**: as the route schema and as the type the client imports. Don't write a parallel TypeScript interface.
- Derive types with `z.infer`; compose schemas with `.pick/.omit/.extend` instead of copying fields.
- **Drift warning (repo-specific):** `server/src/vendor/shared` and `client/src/vendor/shared` have diverged (adapters, eval-ci, knowledge, productionize, trace). Diff both before touching a contract; `adapters.ts` ports are effectively server-side.
- Don't add behaviour to `vendor/shared` — it is contracts and ports only.

## Transport types vs domain types

For simple modules the contract type *is* the domain type — don't invent a second one. Introduce a separate domain/view type only when:
- the HTTP shape differs from what the core wants (snake_case wire format vs camelCase internal; flattened vs nested), or
- the persisted row has columns the API must never expose.

Map in **one** place per direction: `toAgentDto` in `agents/helpers.ts` is the model — a pure function from row → contract DTO, unit-testable, used by the service. Don't map inline in routes. [K2][G1][C1]

## Anti-patterns

- Hand-parsing `req.body` or casting `as Foo` instead of a route schema (`server/CLAUDE.md` forbids it).
- Re-validating inside the service "for safety" — a sign the boundary is in the wrong place. [Z2]
- A second hand-written interface that mirrors a zod-inferred type and drifts.
- Reading vendor JSON in the core (`octokitResponse.data.foo` in a service).
- `z.any()`/`z.unknown()` at the edge, then casting later: parsing postponed is validation skipped. (`z.unknown()` for genuinely opaque payloads like `output_schema` is fine — keep it opaque.)
