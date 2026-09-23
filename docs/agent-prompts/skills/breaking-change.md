# Breaking public contract change

Flag a change that removes or alters the *existence or identity* of a
public contract element — a route, an exported symbol, a required field, an
enum member — in a way that an existing, unmodified caller would trip over.
This skill covers contract *surface*; response body shape internals belong
to the `response-schema` skill instead.

## What to flag

- **Route or RPC removed/renamed**: a Fastify route's URL or HTTP verb
  changed (e.g. `GET /agents/:id/skills` renamed or moved) without the old
  route kept as an alias, or a route deleted while a caller still hits it.
- **Exported symbol removed/renamed**: a function, class, or type exported
  from a package another package or the client consumes (`reviewer-core`
  exports, anything under `vendor/shared/`) is removed, renamed, or moved
  without a re-export shim.
- **HTTP method changed** on an existing route (e.g. `PUT` → `PATCH`).
- **Request shape narrowed**: a body/query/param field that was optional
  becomes required, or is removed, while an unmodified caller still sends
  the old shape.
- **Public enum/union member removed**: breaks any caller doing an
  exhaustive `switch`, or persisting/sending the removed value.
- **Auth/authorization tightened** on a previously less-restricted endpoint
  with no notice — existing callers that lack the new credential/role start
  failing.
- **Meaning changed without a rename**: a parameter or field keeps its name
  but starts meaning something different (e.g. `limit` switches from "item
  count" to "byte count").
- **Only one side of a two-sided contract updated**: the server route
  changed but the client caller — or an OpenAPI spec, if one is generated —
  wasn't updated in the same diff.

## How to judge

- A change is breaking if an existing, unmodified caller (code not touched
  by this diff, or an external API consumer) would send/receive data that no
  longer parses, or would misinterpret a change in meaning.
- Widening is usually SAFE — don't flag it: a new optional field, a new
  route, a new enum member accepted (not required) on the request side.
- A private/internal-only refactor (the symbol has no caller outside this
  diff, and isn't exported from a package another package or the client
  consumes) is not a finding, even if its signature changed completely.
- If the diff updates every caller of the changed surface atomically (route
  + calling code + both contract copies), this may be an intentional,
  fully-migrated break rather than a defect — note it but weigh severity
  down. Still flag it if a caller was clearly missed.

## Severity guidance

- CRITICAL when a removed/renamed route or exported symbol is still used by
  an unmodified caller with no compatibility shim (alias route, re-export).
- WARNING when the break is confined to internal/not-yet-released code, or
  the diff updates callers but not provably all of them.
- SUGGESTION for a technically-breaking change on a symbol/endpoint with
  zero real consumers yet (e.g. a brand-new route added and changed again in
  the same PR).
