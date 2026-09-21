# Breaking API/route signature changes

Flag changes to an HTTP route's contract, or an exported function's public
signature, that would break existing callers — the client app, another
service, or a stored/serialized value — without an explicit migration path.

## What to flag

- **Route path or method changed/removed**: a Fastify route's URL or HTTP
  verb changed (e.g. `GET /agents/:id/skills` renamed or moved) without the
  old route kept as an alias, or a route deleted while the client still
  calls it.
- **Request shape narrowed**: a body/query/param field that was optional
  becomes required, a field's accepted type narrows (e.g. `string` →
  `enum`), or a field is removed — any of these will 422 an existing caller
  sending the old shape.
- **Response shape changed**: a field renamed or removed from a route's
  response, a field's type changed (e.g. `string` → `string | null`, or a
  number that used to always be present becomes optional), or the overall
  response shape changed from an object to an array or vice versa.
- **Status code behavior changed**: an endpoint that used to return 200 now
  returns 201/204, or an error case that used to 404 now 400s (or vice
  versa) — callers that branch on status code will misbehave.
- **Zod contract changes in `vendor/shared/contracts/*`**: adding a
  `.min()`/`.max()`/regex constraint to an existing field, removing a
  `.optional()`/`.nullish()`, or changing an enum's members (removing a
  value breaks anyone persisting/sending it) — these are breaking even
  though they're "just validation."
- **Exported function signature changes** (in a package consumed by
  another, e.g. `reviewer-core` exports, or anything under
  `vendor/shared/`): a parameter added without a default, a parameter
  reordered, a return type narrowed, or a parameter type widened in a way
  that changes meaning (e.g. accepting `string | string[]` where only
  `string` was documented).
- **Silent contract drift**: the two hand-mirrored copies of
  `vendor/shared/contracts/*` (server and client) changed to different
  shapes, or only one copy updated — the wire contract itself doesn't
  match between the two sides even though each compiles.

## How to judge

- A change is breaking if an existing, unmodified caller (client code not
  touched by this diff, or an external API consumer) would send/receive
  data that no longer parses, or would misinterpret a change in meaning.
- Widening acceptance (making a required field optional, adding a new
  optional response field, accepting an additional enum value) is usually
  SAFE — don't flag purely additive, backward-compatible changes.
- Check whether the diff updates every caller in the SAME change (routes +
  the calling client code + both contract copies) — if it does consistently
  and atomically, this may be an intentional, fully-migrated break rather
  than a defect; note it but weigh severity down accordingly. It's still
  worth flagging if a caller was clearly missed.

## Severity guidance

- CRITICAL when a shipped, external caller (not touched in this same diff)
  would break — e.g. a GitHub CI runner posting to a route whose shape
  changed, or a public route response field removed with no deprecation.
- WARNING when the break is internal-only and the diff updates most but
  arguably not all callers, or when only one of the two hand-mirrored
  contract copies was updated.
- SUGGESTION for a technically-breaking but clearly intentional, fully
  migrated, low-blast-radius change (e.g. a brand-new route with no
  existing callers yet).
