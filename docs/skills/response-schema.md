---
name: response-schema
description: Apply when a diff changes the shape of an API response (field types, nullability, optionality, unions, array vs object, always-present fields); check that consumers can still rely on every field they read.
type: rubric
---
# Response schema changes

Clients trust the response shape: a field's type and whether it is always present.
Changing either is breaking even when the field name stays the same.

## Procedure
1. Find changes to response schemas (`z.object` used as a route `response`, DTO
   mappers such as `toXDto`, and the matching `vendor/shared` contract).
2. For each field compare: type, nullability, optionality, union members,
   array/object/scalar kind, and whether it was previously always present.
3. Check the mapper still fills every field the contract declares. A contract field
   that the handler can omit is a silent break.
4. Check the client copy of the contract and its readers in the diff.

## Breaking
- Type change (`number` to `string`, `string` to object, scalar to array).
- Non-null becomes nullable, or required becomes optional: every `x.length` or
  `x.toFixed()` at a call site can now throw.
- A union widens (`'ok' | 'error'` gains `'pending'`) where clients switch exhaustively.
- A field that was always present is conditionally omitted.
- Array becomes paginated object (`T[]` to `{ items: T[], next }`).

## Safe
A new optional field, a new field on an object clients ignore unknown keys of,
a narrower type (nullable becomes non-null).

## Example
Bad: the field becomes nullable with no signal; callers crash on `null`.
```ts
// before
export const Run = z.object({ cost_usd: z.number() });
// after: runs without a price now return null
export const Run = z.object({ cost_usd: z.number().nullable() });
// client: run.cost_usd.toFixed(2)  -> TypeError on null
```
Good: keep the type, add an explicit flag, or announce and migrate the client together.
```ts
export const Run = z.object({
  cost_usd: z.number().default(0),
  cost_known: z.boolean(),
});
```

## How to report
- Cite the schema or mapper line; state old and new field type/nullability.
- Name the reader that breaks (a hook, component or CI step that dereferences it).
- Fix: keep the old shape and add a new field, or change server and client in one
  diff and note it in the changelog.

## Severity guidance
- CRITICAL: a type or nullability change on a response read by clients not updated
  in the diff.
- WARNING: same change with all readers updated, or a union widened.
- SUGGESTION: an additive change that deserves documenting.
