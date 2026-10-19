---
name: api-contract-breaking-change
description: Use when the diff touches an HTTP route, its zod schema, a shared contract (vendor/shared) or a client API call. Flag changes that break existing callers - renamed/removed fields, new required inputs, changed types, paths or status codes.
type: rubric
---
# API contract — breaking changes

Treat every route signature as a public contract with callers you cannot see
(the web client, CI runners, scripts). For each changed route / schema / shared
contract, compare old vs new and flag:

**Request side (breaks existing callers):**
- A new **required** body field, query param or path param.
- A renamed or removed path, path param, query param or body field.
- A narrowed type (string → enum, optional → required, wider → narrower range).
- A changed HTTP method.

**Response side (breaks existing consumers):**
- A removed or renamed response field, or a field that became nullable/optional.
- A changed field type or shape (object → array, number → string).
- A changed success status code (200 ↔ 201/204) or error code/envelope.

**Two-copy rule (this repo):** contracts live twice —
`server/src/vendor/shared` and `client/src/vendor/shared`. A change applied to
only one copy is a breaking change between server and client: flag it.

Not breaking: a new optional field, a new endpoint, a widened input type, an
added enum value on the request side.

Severity: CRITICAL when an existing caller in the diff or the repo will fail at
runtime (or a two-copy mismatch); WARNING when callers are outside the repo.
Suggestion: keep the old shape (alias the old field, make the new input
optional with a default) or version the route; name the callers to update.
