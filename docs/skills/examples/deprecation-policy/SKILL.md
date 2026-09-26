---
name: deprecation-policy
description: Require a marked, documented deprecation period instead of silently removing or renaming a public contract.
type: convention
---
# Deprecation policy

A public route, parameter or response field is never removed or renamed in one step. Flag as WARNING, citing the line, any diff that drops or renames a contract element without all three of:

1. the old element still served for at least one minor version, marked deprecated where the contract is declared (`.describe('Deprecated: use …')`, a `Deprecation` / `Sunset` response header, or a `@deprecated` JSDoc on the shared type)
2. the replacement available in the same release
3. a note in the CHANGELOG or the route's README naming the removal version

A removal that follows a deprecation already recorded in the repo is not a finding.

**Bad**
```ts
// PUT /skills/:id
const UpdateSkillBody = z.object({
  content: z.string(),     // `body` renamed to `content`; old clients now fail validation
});
```

**Good**
```ts
const UpdateSkillBody = z.object({
  body: z.string().optional().describe('Deprecated since 1.5: use `content`. Removed in 2.0.'),
  content: z.string().optional(),
}).refine((b) => b.body !== undefined || b.content !== undefined);
```
