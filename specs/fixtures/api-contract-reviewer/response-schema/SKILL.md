---
name: response-schema
description: Detects changes to the shape of a response — renamed or removed fields, changed types, changed nullability or required-ness — and requires an additive path or a new version before the old shape may go.
type: custom
---

# Response schema

A response shape is read by code you cannot see. For every place in the diff
that produces a response — a route handler's return, a serializer, a DTO
mapper, a `toDto()`, a Zod contract — write down the shape before and after,
then compare key by key.

Report (**WARNING**; **CRITICAL** when the field is an identifier, a key
callers join on, or is read by a consumer visible in the repo):

- a field renamed (`full_name` → `fullName`) or removed;
- a field's type changed — `string` → `number`, scalar → array, object →
  string, a date format, a numeric precision;
- a field that could be `null` and no longer can, or the reverse;
- a field that was always present and is now optional;
- wire casing changed between snake_case and camelCase.

State the old and the new shape as two short JSON fragments, name a consumer
that reads the field, and propose one of two paths: return the old field
**alongside** the new one for a release (additive), or serve the new shape
under a new route version.

Do **not** flag adding an optional field, adding a member to a list, or shapes
that only exist in tests and mocks.

## Good

```ts
return {
  id,
  full_name: repo.fullName, // @deprecated since 1.5 — use `fullName`; removed in 2.0
  fullName: repo.fullName,
};
```

Both keys are served for one release; consumers migrate on their own schedule,
and the old key is removed under the next major version.

## Bad

```diff
 return rows.map((pr) => ({
   id: pr.id,
-  full_name: pr.repoFullName,
-  head_sha: pr.headSha,
+  fullName: pr.repoFullName,
 }));
```

`full_name` renamed and `head_sha` dropped in one commit; the client's `PRRow`
reads both and will render `undefined`. CRITICAL: cite the lines, show
`{ "full_name": …, "head_sha": … }` → `{ "fullName": … }`, name `PRRow`, and
propose the side-by-side shape above.
