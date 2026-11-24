---
name: breaking-change
description: Apply when a diff removes, renames or tightens a public API contract (route, method, path, status code, request or response field, enum value, error shape); check that existing clients keep working or that a migration path ships in the same change.
type: rubric
---
# Breaking change

A change is breaking when a client written against the old contract fails or
misbehaves without being edited. In this codebase a zod contract is the route schema
AND the client type, so every contract or route edit is a public-interface change.

## Procedure
1. List changed routes and contract files (`routes.ts`, `contracts/*.ts`,
   `vendor/shared`, in both server and client copies).
2. For each, compare the old and new shape: paths and methods, status codes, request
   fields (required, validation limits), response fields, enums, error body.
3. Classify each difference: **breaking** (below), **safe** (additive), or
   **semantic** (same shape, different behavior).
4. For every breaking one, look for a migration path in the diff: the old name kept
   as an alias, the new input optional with a default, a deprecation notice, or a
   versioned route.

## Breaking
- Removed or renamed route, field or enum value.
- Changed method, path or status code (200 to 201, 404 to 422, 200 to 204).
- New required request field, query param or header.
- Stricter validation: shorter `max`, new `min`, regex, `.strict()` on an object that
  tolerated extras, an accepted value removed.
- Changed error shape, code or message key that clients parse.
- Semantics changed under the same shape: default sort, pagination defaults, units,
  scope (now filtered by workspace).

## Safe
Adding an optional request field, a new response field, a new route, or a new enum
value in a response that clients treat as open.

## Example
Bad: the response field is renamed in one step; every reader gets `undefined`.
```ts
// before
export const Run = z.object({ id: z.string(), cost: z.number() });
// after: breaks every client that reads run.cost
export const Run = z.object({ id: z.string(), cost_usd: z.number() });
```
Good: add the new field, keep the old one, mark it deprecated, remove it later.
```ts
export const Run = z.object({
  id: z.string(),
  cost_usd: z.number(),
  /** @deprecated use cost_usd; removed in 3.0 */
  cost: z.number(),
});
```

## How to report
- Cite the changed schema or route line.
- State the old and new shape and who breaks ("client `useRuns` reads `run.cost`").
- Fix: keep the old field beside the new one, make the new input optional with a
  default, or version the route.

## Severity guidance
- CRITICAL: breaking change on a public or shared route/contract with no migration path.
- WARNING: breaking change whose only consumer is updated in the same diff, or a
  semantic change that may surprise callers.
- SUGGESTION: a safe change that needs a changelog note.
