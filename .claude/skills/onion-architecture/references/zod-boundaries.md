# Zod at the boundaries

## Contents
- Three kinds of schema
- Parse once, at the edge
- Config and secrets
- LLM output
- Versions

## Three kinds of schema

| Kind | Lives in | Used by |
|---|---|---|
| Transport (request/response DTO) | `routes.ts` (module-local) or `@devdigest/shared` (shared with client — both copies) | route `schema`, client |
| Domain invariant (optional) | `domain.ts` — e.g. `.brand<'AgentName'>()` value objects | domain constructors |
| Persistence / external payload | inside the adapter (`drizzle-zod`, LLM output schema, GitHub payload) | adapter only |

- Don't use a request schema as the domain type; a request may omit fields the
  entity requires, and the API must be free to change shape.
- Never expose `drizzle-zod` `createSelectSchema` output as an API contract — it
  couples the API to table columns.

## Parse once, at the edge

- Route input: `schema: { params, querystring, body }` — the handler receives typed
  data; never call `.parse(req.body)` in a handler.
- Route output: `schema.response` — serialization fails loudly (500, logged).
- Inner rings trust their input types; they re-check only domain invariants.

## Config and secrets

- `platform/config.ts` parses `process.env` once with a zod schema into `AppConfig`;
  adapters get config via the container.
- API keys are **not** in `AppConfig` — only `SecretsProvider` reads them.
- No `process.env` anywhere else.

## LLM output

- The structured-output schema and its validation (`parseWithRepair`,
  reviewer-core `structured.ts`) live in the adapter / reviewer-core; callers get
  typed domain results (`Review`, `Finding`) or a typed error.

## Versions

- Zod 3 with `fastify-type-provider-zod@4.x` (v5+ requires Zod 4) — upgrade both together.
- Check `drizzle-zod` compatibility with Zod 3 before adding it.
