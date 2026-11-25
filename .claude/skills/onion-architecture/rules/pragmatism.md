# Pragmatism — when NOT to apply full onion

Onion Architecture earns its keep when business logic is non-trivial. For a read-only endpoint hitting one table with zero business logic, the full three-file layered module is ceremony.

## The CRUD escape hatch

If **all** of these are true:

- The endpoint reads from (or writes to) one table.
- There is no branching logic beyond input validation.
- No adapter besides the repository is involved.
- No external invariant has to hold across the operation.

Then the route may call the repository directly.

```ts
// server/src/modules/workspace/routes.ts — hypothetical read-only endpoint
app.get('/workspace', { schema: GetWorkspaceSchema }, async () => {
  return await app.container.workspaceRepo.get();
});
```

## What still holds

Even in the escape-hatch case, the dependency rule is not relaxed:

- **Drizzle stays inside `repository.ts`.** The route never imports `../db/schema`.
- **Zod validation stays on the route.** Request/response schemas are not optional.
- **Errors still go through `AppError`.** The repository throws `AppError` if the row isn't found; the route doesn't invent a 404 by hand.

## When to add the service back

The moment any of these show up, introduce `service.ts`:

- A second repository call or adapter interaction.
- A branch that decides business outcome ("if the PR is draft, skip the review").
- A cross-cutting invariant (workspace scoping check, authorization gate beyond auth middleware).
- Anything worth unit-testing in isolation.

The cost of adding a service later is one indirection; the cost of threading business logic through a route is a layering violation that spreads.

## Signal the choice

If a reader might reasonably expect a service, drop a one-liner on the route explaining the choice — no service exists because there is no logic to hold. Don't paste this rationale onto every trivial CRUD endpoint; use it where the absence would otherwise confuse a reader.

## Source

This escape hatch is explicitly endorsed in Methods & Tools, "Chop Onions Instead of Layers" — Onion is "not for small apps" where the ceremony outweighs the payoff. See [references.md](references.md).
