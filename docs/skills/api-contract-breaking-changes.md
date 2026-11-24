---
name: api-contract-breaking-changes
description: Apply when a diff changes an HTTP route, its zod request/response schema or error shape; check for changes that break existing clients (removed or renamed fields, narrowed types, new required inputs, changed status codes).
type: rubric
---
# API contract breaking changes

In this codebase the zod contract is both the route schema and the client type, so
any edit to a contract or route is a public-interface change. Compare the old and
new shape in the diff and check the list below.

## Breaking-change checklist
1. **Removed or renamed response field**: clients reading it get `undefined`.
2. **Narrowed response type**: a non-null field becomes nullable, a type becomes a
   wider union, or a number becomes a string; consumers' assumptions break.
3. **New required request field, query param or header**: existing callers start
   failing with 422.
4. **Stricter request validation**: shorter `max`, new `min`, a regex, a removed
   accepted value, `.strict()` on an object that tolerated extras.
5. **Enum value removed or renamed**, in a request or a response.
6. **Changed status code**: 200 to 201, 404 to 422, 200 to 204.
7. **Changed error shape**: different error body, code or message key that clients
   parse.
8. **Path or method change**: renamed route, moved prefix, GET to POST.
9. **Changed semantics with the same shape**: default sort order, pagination
   defaults, units, scope (now filtered by workspace).
10. **Removed route** without a deprecation period.

Safe changes: adding an optional request field, adding a response field, adding a
new enum value to a response that clients treat as open, adding a new route.

## Procedure
1. Find route files and contract files in the diff (`routes.ts`, `contracts/*.ts`,
   `vendor/shared`).
2. Diff old versus new shape item by item against the checklist.
3. Check whether both `vendor/shared` copies (server and client) were updated, and
   whether the client callers in the diff were adapted.
4. Check for a version prefix, a deprecation path or a compatibility shim.

## How to report
- Cite the changed schema or route line.
- State the old and new shape and who breaks ("client `useRuns` reads
  `run.cost`, which is now `cost_usd`").
- Fix: keep the old field alongside the new one, make the new input optional with
  a default, or version the route.

## Severity guidance
- CRITICAL: a breaking change on a public or shared route that is not versioned and
  has no migration path.
- WARNING: breaking change on an internal route whose only consumer is updated in
  the same diff, or a semantic change that may surprise callers.
- SUGGESTION: a safe change that would be clearer with a doc or changelog note.
