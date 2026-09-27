---
name: breaking-change
description: Flags any change or removal of a published contract — a route, its parameters, an exported signature or a response field — that an existing caller cannot survive, and names the caller that breaks.
type: custom
---

# Breaking change

A published contract is anything a caller outside this diff can depend on: an
HTTP route and its method, a path / query / body parameter, a response field,
an exported function's positional parameters or return type, an event name, an
environment variable the deployment reads.

Report **CRITICAL** when the diff, without a version bump, a deprecation window
or an adapter:

- removes or renames a route, a parameter, or a response field;
- turns an optional parameter into a required one, or narrows what it accepts
  (a shorter enum, a new minimum, a stricter pattern, a removed default);
- changes the type, nullability or cardinality of a value on the wire;
- changes a status code or the shape of an error envelope;
- reorders or repurposes the positional parameters of an exported function.

For every finding state, in this order: (1) the contract as it was, (2) as it
becomes, (3) which caller breaks and what it observes — a 422, an `undefined`,
a `TypeError` — and (4) the smallest change that would not break it.

Do **not** flag: a new optional field, a new route, a widened enum, a new
nullable column, a stricter internal type that never reaches the wire, or a
break the diff already pairs with a version bump, a deprecation marker or an
old/new side-by-side.

## Good

```diff
 const ListQuery = z.object({
-  status: z.enum(['open', 'merged', 'closed']).optional(),
+  status: z.enum(['open', 'merged', 'closed', 'draft']).optional(),
 });
```

The enum widened and the parameter stayed optional: every request that worked
yesterday works today. Nothing to report.

## Bad

```diff
 const ListQuery = z.object({
-  status: z.enum(['open', 'merged', 'closed']).optional(),
+  status: z.enum(['open', 'merged', 'closed']),
 });
```

`status` is now required. Every caller that omitted it — the web app's PR list
and the CI runner both do — receives 422 from the schema layer before the
handler runs. CRITICAL: cite the line, name the caller, and propose
`.default('open')` or keeping `.optional()`.
