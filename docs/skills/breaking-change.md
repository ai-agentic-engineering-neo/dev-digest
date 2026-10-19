---
name: breaking-change
description: Use when the diff changes or removes anything callers depend on - a route path or method, a request param or body field, an exported function/type of a shared contract or published package. Flag every change that makes an existing, valid call fail or behave differently.
type: rubric
---
# Breaking change — public contract changed or removed

A public contract is anything a caller you may not see relies on: HTTP routes
(path, method, params, body, auth), exported functions and types of a shared or
published package, event / message payloads, CLI flags, env vars read by other
services. For each one the diff touches, ask: **does a call that worked before
this PR still work, unchanged, after it?** If not, it is breaking.

Breaking:
- Removed or renamed route, path param, query param, body field, exported symbol.
- A new **required** input (body field, query param, header, function argument).
- A narrowed input: optional → required, `string` → enum, a tighter range/length.
- A changed HTTP method, auth requirement, or the meaning of an existing value
  (same field, different unit or semantics — e.g. cents → dollars).
- A changed default that alters behaviour for callers who omit the input.

Not breaking: a new optional input with a default that preserves old behaviour,
a new endpoint or export, a widened input type.

## Example

Bad — renames a path param and adds a required query param in place:
```diff
-app.get('/agents/:id/skills', { schema: { params: IdParams } }, handler)
+app.get('/agents/:agentId/skill-links', {
+  schema: { params: AgentParams, querystring: z.object({ include: z.enum(['body']) }) },
+}, handler)
```
Every existing `GET /agents/:id/skills` call now 404s, and a call to the new path
without `?include=` gets 422.

Good — the new shape is additive; the old route keeps working:
```diff
 app.get('/agents/:id/skills', { schema: { params: IdParams } }, handler)
+app.get('/agents/:id/skill-links', {
+  schema: { params: IdParams, querystring: z.object({ include: z.enum(['body']).optional() }) },
+}, linksHandler)
```

## Report
- CRITICAL — a caller in the diff or the repo (client, SDK, script, test fixture)
  still uses the old contract and will fail at runtime.
- WARNING — breaking, but callers are outside the repo or not visible.
- Cite the changed contract line. Name the caller(s) that break and the failing
  call. Suggest the additive alternative (keep the old input/route, make the new
  input optional with a default) or the callers to update in the same PR.
