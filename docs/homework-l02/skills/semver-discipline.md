---
name: semver-discipline
description: Decide which version bump a contract change needs and flag changes that need a major bump but ship as minor or patch, or with no version or changelog note at all.
type: security
---
# semver-discipline

## Rules
- MAJOR: anything that breaks an existing caller - removed or renamed route or
  field, retyped field, new required input, narrower enum, changed status code
  or error shape callers branch on.
- MINOR: backward-compatible additions - new route, new optional field, new
  enum value callers can ignore.
- PATCH: no contract change - bug fixes that keep the shape.
- If the diff contains a MAJOR change, flag it (WARNING) unless the same diff
  bumps the major version (package.json, API version prefix such as `/v2`, a
  changelog entry marked breaking). Name the change that forces the bump.
- Do not ask for a bump on internal refactors.

## Good (not a finding)
```diff
-  "version": "1.4.2",
+  "version": "2.0.0",
```
together with `CHANGELOG.md`: "BREAKING: `DELETE /repos/:id` returns `removedId`".

## Bad (WARNING)
```diff
-  "version": "1.4.2",
+  "version": "1.5.0",
```
in a diff that removes `POST /repos/:id/poll`.
