---
name: response-schema
description: Flag renamed or removed response fields, type and nullability changes, removed enum values and re-wrapped payloads; additive optional fields are fine.
---

# Response Schema Stability

## Rule
Clients deserialize responses against the shape they were built for. A response
field that disappears, is renamed, changes type, or stops being guaranteed breaks
those clients even when the route path and status code are unchanged. A rename is a
removal plus an addition, so it is breaking. Adding a new optional field is not.

## Directive
Flag each of the following when this diff introduces it. Name the route, the field
(with its JSON path, for example `customer.email`), and what a client that reads it
now gets.

1. **Removed or renamed field** - `total` becoming `amount`, or a property dropped
   from the handler's return value, the serializer, or the schema.
2. **Changed type** - `number` to `string`, `integer` to `object`, a scalar to an
   array, or a changed `format` (`date-time` string to epoch number).
3. **Guarantee weakened** - a field that was always present becomes optional or
   nullable (`required` entry removed, `type: 'string'` to `['string', 'null']`, a
   handler branch that now returns `undefined`). The opposite direction, a field that
   becomes always present, is compatible for responses.
4. **Enum values renamed or removed** - a client matching on `'pending'` silently
   stops matching. A newly added value on an enum documented as closed is a WARNING.
5. **Structure changed** - flattening or nesting (`customer.name` to
   `customerName`), an array turned into an object keyed by id, or the payload wrapped
   in an envelope (`{ data: ... }`).
6. **Changed meaning or unit** - same field name, different semantics (cents to
   dollars, UTC to local time), when the diff makes the change visible.
7. **Fastify serializer trap** - when a route declares `schema.response`, the
   serializer emits only the properties listed there. A property deleted from the
   response schema disappears from the wire even if the handler still returns it, and
   a property missing from the schema is never sent.

Do not flag additive optional fields, new fields on new routes, or reordered keys.

For every finding, name the compatible path: add the new field and keep the old one
in the same response (marked deprecated) for a migration window, or introduce the
new shape under a new route version.

Severity guidance: a removed, renamed or retyped field on a route that callers can
already reach is a **CRITICAL**. A weakened guarantee, an enum change, a re-wrapped
payload on an internal route, or an addition to a closed enum is a **WARNING**.
Undocumented additive fields are at most a **SUGGESTION**.

## Good
The new field is added, the old one is kept with the same value and marked
deprecated, so both old and new clients keep working.

```ts
const OrderResponse = {
  type: 'object',
  required: ['id', 'total', 'amount', 'currency'],
  properties: {
    id: { type: 'string' },
    total: { type: 'number', deprecated: true }, // kept until the v2 cut-over
    amount: { type: 'number' },
    currency: { type: 'string' },
  },
};

return { id: order.id, total: order.cents, amount: order.cents, currency: order.currency };
```

## Bad
`total` was renamed to `amount` and `currency` was dropped in one edit. Existing
clients read `undefined` for both.

```diff
 const OrderResponse = {
   type: 'object',
-  required: ['id', 'total', 'currency'],
+  required: ['id', 'amount'],
   properties: {
     id: { type: 'string' },
-    total: { type: 'number' },
-    currency: { type: 'string' },
+    amount: { type: 'number' },
   },
 };

-return { id: order.id, total: order.cents, currency: order.currency };
+return { id: order.id, amount: order.cents };
```

```diff
 # openapi.yaml
   Order:
     properties:
-      total: { type: number }
+      total: { type: string }   # number to string: every arithmetic client breaks
```
