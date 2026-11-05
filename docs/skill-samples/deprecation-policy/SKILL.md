---
name: deprecation-policy
description: >
  Use on every PR that removes, renames or replaces a route, field, param or enum value
  of a public API. Flag silent removals: the old contract must first be marked deprecated
  (docs + Deprecation/Sunset headers or @deprecated) and kept for at least one release.
type: rubric
allowed-tools: Bash(curl:*)
---
# Deprecation policy

Public contracts are retired in two steps: **deprecate**, then (in a later major release)
**remove**. A PR that removes or replaces something in one step is a silent removal.

- CRITICAL: a route, response field, request param or enum value is deleted or renamed
  without having been deprecated in an earlier release.
- WARNING: something is deprecated but without a replacement named, without a sunset
  date, or without a `Deprecation` / `Sunset` response header (see the reference).
- WARNING: a deprecated item is removed in a minor/patch release.
- SUGGESTION: a `@deprecated` JSDoc / OpenAPI `deprecated: true` is missing on an item the
  PR stops using internally.

Bad — the old field silently disappears:
```ts
- return { id, user_name: u.name };
+ return { id, display_name: u.name };
```

Good — keep the old field, mark it, point to the replacement:
```ts
return {
  id,
  display_name: u.name,
  /** @deprecated use display_name; removed in v3 (sunset 2027-01-01) */
  user_name: u.name,
};
```

In the finding name the removed item, the replacement and the release it can be removed in.
