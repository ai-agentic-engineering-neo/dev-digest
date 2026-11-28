---
name: deprecation-policy
description: Flag a public route or field removed in one step. Require it to be marked deprecated first, kept working as an alias for at least one release, and removed only in a later major version.
type: security
---
# deprecation-policy

## Rules
- A public route, field or client function is retired in two steps:
  1. Deprecate: keep it working, mark it (`deprecated: true` in the schema,
     `@deprecated` JSDoc, a `Deprecation`/`Sunset` header or a log warning) and
     add the replacement next to it.
  2. Remove: only in a later major version, after callers moved.
- Report as WARNING (CRITICAL when callers in the diff still use it) a removal
  with no prior deprecation, and suggest the alias that would make step 1.
- A deprecation without a replacement is a WARNING: tell callers what to use.

## Good (not a finding)
```ts
/** @deprecated use `removedId`; removed in v3. */
deleted: z.string(),
removedId: z.string(),
```

## Bad (WARNING / CRITICAL)
```diff
-  deleted: z.string(),
+  removedId: z.string(),
```
No alias, no `@deprecated`, and `client/src/lib/hooks/core.ts` still reads `deleted`.
