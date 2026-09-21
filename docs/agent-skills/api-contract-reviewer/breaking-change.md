---
name: breaking-change
description: Flag removed or renamed HTTP routes, changed paths or verbs, new required inputs, narrowed accepted values and changed status codes; require a versioned alternative.
---

# Breaking Change Detection

## Rule
An HTTP route is a contract with callers that cannot be redeployed in lockstep with
the server. Any change to the request side of a route (path, verb, inputs, auth) or
to the status codes callers branch on, that makes a call which worked before fail or
behave differently, is a breaking change. It is acceptable only when the old
behaviour keeps working next to the new one (a versioned route, an alias, or an
opt-in flag).

## Directive
Flag each of the following when this diff introduces it. Name the route as
`METHOD /path`, and state the concrete call that worked before and fails after.

1. **Removed route or verb** - a `app.get/post/put/patch/delete(...)` registration,
   or an OpenAPI path/operation, deleted with no replacement in the same diff.
2. **Moved or renamed path** - a changed literal segment, dropped or changed version
   prefix (`/v1/orders` to `/orders`), or a changed path template. Renaming only a
   path parameter (`:id` to `:orderId`) keeps the URL identical on the wire but
   breaks generated clients, OpenAPI consumers and code reading `request.params.id`;
   report it as a WARNING unless the same diff also changes the URL shape.
3. **Changed HTTP verb** - for example `PUT` to `PATCH`, or `GET` to `POST`.
4. **New required input** - a new required query parameter, header or body field, or
   an existing optional one made required. A new optional input with a server-side
   default is compatible.
5. **Narrowed accepted values** - a lower `maxLength`/`maximum`, a stricter `pattern`
   or `format`, an enum value removed from the accepted set, or
   `additionalProperties: false` newly added to a request body.
6. **Changed status codes or error shape** - `200` to `204`, `404` to `400`, `201` to
   `200`, or a changed error body that callers parse.
7. **Newly required authentication or scope** on a route that was open before.

For every finding, ask for a versioned alternative: keep the old route/behaviour and
add the new one under a new version prefix (`/v2/...`), accept both shapes for a
migration window, or gate the new behaviour behind an opt-in.

Do not flag: new routes, new optional inputs, loosened validation, added response
fields (the `response-schema` rule covers response bodies).

Severity guidance: a removed, moved or verb-changed route, a new required input, or a
narrowed accepted value on a route that callers can already reach (a published
`/v1` route, a route documented in the OpenAPI file, or one used elsewhere in the
repo) is a **CRITICAL** because existing calls start failing. A path-parameter rename
and breaks on a route explicitly marked internal are a **WARNING**.

## Good
The old route is untouched and keeps serving existing callers; the new shape ships
next to it, with the new input optional.

```ts
// v1 keeps its exact contract
app.get('/v1/orders/:id', { schema: { params: IdParams } }, getOrderV1);

// v2 ships beside it; `expand` is optional so simple calls still work
app.get(
  '/v2/orders/:orderId',
  {
    schema: {
      params: OrderIdParams,
      querystring: { type: 'object', properties: { expand: { type: 'string' } } },
    },
  },
  getOrderV2,
);
```

```yaml
# openapi.yaml - additive, optional parameter
parameters:
  - name: expand
    in: query
    required: false
```

## Bad
The path changed, the version prefix was dropped and a new query parameter became
mandatory, so every existing `GET /v1/orders/42` call now returns 404 or 400.

```diff
-app.get('/v1/orders/:id', { schema: { params: IdParams } }, getOrder);
+app.get(
+  '/orders/:orderId/details',
+  {
+    schema: {
+      params: OrderIdParams,
+      querystring: {
+        type: 'object',
+        required: ['expand'],
+        properties: { expand: { type: 'string' } },
+      },
+    },
+  },
+  getOrder,
+);
```

```diff
 # openapi.yaml
   parameters:
     - name: expand
       in: query
-      required: false
+      required: true
```
