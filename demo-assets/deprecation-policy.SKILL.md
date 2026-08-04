---
name: deprecation-policy
description: Flag silent removal of a public API element instead of a deprecation path.
---

# Deprecation policy

When a diff removes a public route, exported function/type, or response
field, check whether it went through a deprecation step first — a prior PR
that marked it deprecated, kept it working, and gave callers a migration
path — rather than disappearing in this diff with no warning.

**Bad** — an endpoint disappears with no deprecation history:
```ts
// before: GET /v1/users/:id/profile (no deprecation notice ever shipped)
// after: route removed entirely
```

**Good** — the old path is marked deprecated and kept alive for a transition
window before removal, with a clear pointer to the replacement:
```ts
/** @deprecated Use GET /v2/users/:id instead. Removed in a future major. */
app.get('/v1/users/:id/profile', handler);
app.get('/v2/users/:id', newHandler);
```

Report a finding at CRITICAL when a public element is removed in this diff
with no evidence (comment, changelog, prior deprecation marker) that callers
were ever warned. Do NOT flag removal of something already marked
`@deprecated` in a prior commit that this diff is now cleaning up — that IS
the policy working as intended.
