---
name: breaking-change
description: Flag any change that removes or renames a public route, method, path parameter, exported client function or response field without leaving a backward-compatible alias. Rate it CRITICAL.
type: security
---
# breaking-change

A public contract is anything a caller outside this change depends on: HTTP
routes and their methods and path parameters, response fields, exported API
client functions, shared schema exports.

## Rules
- Removing or renaming any of these is a breaking change. Report it as
  CRITICAL and cite the removed or renamed line.
- A rename is still breaking when the new name is "better". Callers break the
  same way.
- It is not breaking when the old name stays as a working alias in the same
  diff, or when nothing outside the module used it (say why you know).
- Check the other side: if the server renames a field, look for the client code
  that still reads the old name, and cite it too.

## Good (not a finding)
```ts
// old route kept as a deprecated alias
app.post('/repos/:id/sync', handler);
app.post('/repos/:id/poll', { schema: { deprecated: true } }, handler);
```

## Bad (CRITICAL)
```diff
-app.post('/repos/:id/poll', handler);
+app.post('/repos/:repoId/sync', handler);
```
```diff
-return { deleted: id };
+return { removedId: id };
```
