---
name: response-schema
description: Use when the diff changes what an endpoint or exported function returns - a response schema, DTO, mapper, serializer or the handler's return value. Flag changed field types, fields that became optional or nullable, removed or renamed fields, and handlers whose output no longer matches their declared schema.
type: rubric
---
# Response schema — shape, types, required fields

Consumers parse responses by field name and type. For every changed response
(schema, DTO type, mapper, `return` of a handler), compare old vs new field by
field and check the code still produces exactly what the schema declares.

Flag:
- A removed or renamed field, or a field moved into / out of a nested object.
- A changed type or shape: `number` → `string`, object → array, a date that changed
  format, an enum value removed or renamed.
- A field that became **optional or nullable** — every consumer that reads it
  without a check now crashes or renders `undefined`.
- Schema violation: the mapper/handler returns a field the schema doesn't declare,
  omits a required one, or returns `null` where the schema says non-null (e.g. a
  nullable DB column mapped straight to a required field).
- A new field read from stored or cached data (jsonb snapshot, cache entry) that
  older rows don't have, with no default.
- A changed success status code (200 ↔ 201 / 204) or error envelope.

Not breaking: a new optional field, or a new required field that every code path
always fills.

## Example

Bad — the field becomes nullable and the mapper passes the raw column through:
```diff
 export const Skill = z.object({
   id: z.string(),
-  description: z.string(),
+  description: z.string().nullable(),
 });
 const toDto = (r: SkillRow): Skill => ({
   id: r.id,
-  description: r.description,
+  description: r.description, // column is now nullable
 });
```
`skill.description.trim()` in the client card now throws for every skill
without a description.

Good — the contract stays non-null; the mapper owns the default:
```diff
 const toDto = (r: SkillRow): Skill => ({
   id: r.id,
-  description: r.description,
+  description: r.description ?? '',
 });
```

## Report
- CRITICAL — a consumer in the diff or the repo reads the changed field as before
  and will fail, or the handler's output violates its own response schema (the
  request errors or returns wrong data).
- WARNING — the shape changed but no consumer is visible, or the violation only
  shows on some rows (old data, nullable column).
- Cite the schema or mapper line. Name the field, old → new type, and the
  consumer that breaks. Suggest the compatible form (keep the old field, add a
  new one, default at the mapper) instead of changing the existing field.
