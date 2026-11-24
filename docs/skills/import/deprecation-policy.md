---
name: deprecation-policy
description: Apply when a diff removes or replaces a public field, route, parameter or enum value; check it is first marked deprecated with a replacement and a removal date instead of being deleted silently.
type: rubric
---
# Deprecation policy

Public API surface is removed in two steps: **deprecate** (still works, clearly
marked), then **remove** (a later major version). Deleting in one step is a silent
break.

## Procedure
1. Find removed or replaced public fields, routes, query params and enum values.
2. For each, check whether the previous release already marked it deprecated. If the
   diff itself is the first mention, the removal is premature.
3. If the diff adds a deprecation, check it carries: the replacement, the version it
   was deprecated in, and the planned removal version or date.
4. Check the signal reaches consumers: a `@deprecated` JSDoc on the contract, a
   `Deprecation` / `Sunset` response header for routes, a changelog line.

## Required for a deprecation
- Old behavior keeps working unchanged until the removal version.
- A replacement exists and is named.
- A removal version or date is stated.
- A runtime or doc signal, not only a code comment nobody reads.

## Example
Bad: the route is deleted; clients get 404 with no warning.
```ts
- app.get('/runs/:id/cost', handler);
```
Good: the route still works and tells clients when it goes away.
```ts
/** @deprecated use GET /runs/:id (field cost_usd). Removed in 3.0. */
app.get('/runs/:id/cost', async (req, reply) => {
  reply.header('Deprecation', 'true');
  reply.header('Sunset', 'Wed, 31 Dec 2026 23:59:59 GMT');
  return getCost(req.params.id);
});
```

## How to report
- Cite the line that removes or replaces the surface.
- State what was removed and that it was not deprecated first.
- Fix: restore it with a deprecation marker, name the replacement and the removal
  version, and add a changelog line.

## Severity guidance
- CRITICAL: removal of a public route or field with no prior deprecation, on a
  contract with external or unmigrated consumers.
- WARNING: a deprecation missing the replacement, the removal date or any consumer-visible signal.
- SUGGESTION: a deprecation that would benefit from a changelog line.
