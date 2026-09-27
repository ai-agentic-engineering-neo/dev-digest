---
name: deprecation-policy
description: Requires that any contract element the diff removes or replaces was first marked deprecated with a named replacement and a removal horizon, and flags silent removal.
type: custom
---

# Deprecation policy

Nothing public disappears in one step. Before a route, a parameter, a response
field or an export is removed, the code being removed must already carry a
deprecation marker:

- a `@deprecated` JSDoc tag naming the replacement and the removal version or
  date — `@deprecated since 1.5 — use fullName; removed in 2.0`;
- for HTTP, a `Deprecation` and a `Sunset` response header, or
  `deprecated: true` in the route schema;
- the old and the new element served side by side for at least one release.

Report:

- **CRITICAL** — an element removed that had no replacement at all;
- **WARNING** — an element removed with no prior deprecation marker anywhere
  in the removed code; a `@deprecated` marker with no replacement ("do not
  use") or no removal horizon; a `@deprecated` element still used inside the
  same repository — deprecation without migration.

Always propose the two-step change: keep the old element, add the marker and
the replacement in this PR, remove in the next major version.

## Good

```ts
/** @deprecated since 1.5 — use `fullName`; removed in 2.0. */
full_name: repo.fullName,
fullName: repo.fullName,
```

```ts
reply
  .header('Deprecation', 'true')
  .header('Sunset', 'Sat, 31 Oct 2026 00:00:00 GMT')
  .header('Link', '</v2/repos/:id/pulls>; rel="successor-version"');
```

The old key and the old route keep working, announce their end, and point at
what replaces them.

## Bad

```diff
 return rows.map((pr) => ({
   id: pr.id,
-  head_sha: pr.headSha,
   state: pr.state,
 }));
```

`head_sha` is gone with no `@deprecated`, no replacement and no sunset date.
WARNING: cite the removed line and give the two-step version — keep the key,
mark it, remove it in the next major.
