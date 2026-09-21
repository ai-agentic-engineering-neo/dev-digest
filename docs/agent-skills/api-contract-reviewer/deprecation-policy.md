---
name: deprecation-policy
description: Require deprecation markers (@deprecated, Deprecation and Sunset headers, changelog entry, minimum window) before any route, field or value is removed, instead of silent removal.
---

# Deprecation Policy

## Rule
Removal is the last step of a lifecycle, not the first. A public route, response
field, request parameter or enum value must be marked deprecated, announced, and kept
working for a minimum window before it is deleted. The default window is 90 days or
one minor release, whichever is longer, unless the repository documents another one.

## Directive
When the diff removes, renames or stops supporting part of the API surface, check
that the same diff carries these deprecation artifacts, and flag each one that is
missing:

1. **Code marker** - a JSDoc `@deprecated` tag naming the replacement and the removal
   version or date; for Fastify routes, `schema: { deprecated: true }`; for OpenAPI,
   `deprecated: true` on the operation, parameter or property.
2. **Runtime signal** - the deprecated route responds with a `Deprecation` header and
   a `Sunset` header (the removal date), plus a `Link` header with
   `rel="successor-version"` pointing at the replacement.
3. **Changelog or migration note** - a `CHANGELOG.md` entry (or migration guide) that
   names the deprecated item, the replacement, and the removal date or version.
4. **Minimum window** - the first diff that introduces a deprecation must not also
   remove the item. Deleting an item whose deprecation is not visible in the diff or
   its context, or whose `Sunset` date has not passed, is an early removal.
5. **Replacement exists** - a removal that names no replacement and gives callers no
   migration path.

Report the removal itself under the breaking-change and response-schema rules when
those are also linked. Under this rule, raise one finding that lists the missing
artifacts, and do not restate the break.

Do not flag: removal of code that was never part of a public contract (internal
helpers), or removal of an item whose deprecation, sunset date and changelog entry
are all visible and whose window has elapsed.

Severity guidance: a public route, field or parameter removed with none of the
artifacts above is a **CRITICAL** when nothing replaces it and it is deleted
outright; otherwise a missing marker, header or changelog entry is a **WARNING**.
A missing `Sunset` header alone is a **SUGGESTION**.

## Good
The field stays for a window, is marked, announced, and signalled at runtime.

```ts
/**
 * @deprecated Use `amount`. Scheduled for removal in v2.0.0 (Sunset 2027-01-31).
 */
total: { type: 'number', deprecated: true },
```

```ts
app.get('/v1/orders/:id', opts, async (req, reply) => {
  reply.header('Deprecation', '@1767225600'); // deprecated since 2026-01-01
  reply.header('Sunset', 'Sun, 31 Jan 2027 23:59:59 GMT');
  reply.header('Link', '</v2/orders/42>; rel="successor-version"');
  return getOrderV1(req);
});
```

```md
## 1.4.0
### Deprecated
- `GET /v1/orders/:id` and response field `total`. Use `GET /v2/orders/:orderId` and
  `amount`. Removal no earlier than 2027-01-31.
```

## Bad
The route and field are deleted in the same diff that introduces the replacement, with
no marker, no header and no changelog line.

```diff
-app.get('/v1/orders/:id', opts, async () => {
-  return { id, total, currency };
-});
+app.get('/v2/orders/:orderId', opts, async () => {
+  return { id, amount };
+});
```

```diff
 # openapi.yaml
-  /v1/orders/{id}:
-    get:
-      operationId: getOrder
+  /v2/orders/{orderId}:
+    get:
+      operationId: getOrderV2
```
