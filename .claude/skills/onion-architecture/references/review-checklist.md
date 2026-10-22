# Review checklist — server diffs

Use before finishing backend work and when reviewing a server PR.

## Checklist

- [ ] Every new endpoint has a route **and** a service method; the handler only parses, resolves
      context, calls the service and sets a status.
- [ ] No `drizzle-orm` / `db/schema` / `container.db` outside `repository*` and `db/`.
- [ ] No `fastify`, SDK (`octokit`, `openai`, `@anthropic-ai/sdk`, `simple-git`, `@ast-grep/napi`)
      or `node:fs` import in a service, helper or route.
- [ ] No `process.env` outside `platform/config.ts`, `db/`, and adapters that already read it.
- [ ] Every new repository method is workspace-scoped and named after a business operation.
- [ ] Row types are mapped to `@devdigest/shared` contracts before leaving the service.
- [ ] Driver quirks (`sum()` strings, `jsonb` casts) are handled in the repository.
- [ ] New external system → port in shared + adapter + mock + `ContainerOverrides` field.
- [ ] No import of another module's `repository.ts` / `service.ts` — use the container.
- [ ] Business failures throw `AppError` subclasses; no hand-built error responses.
- [ ] Pure logic sits in `helpers.ts` with a unit test; no `Date.now()` / random inside it.
- [ ] Contract changed → mirrored in `client/src/vendor/shared`.

## Grep recipes (run from repo root)

```bash
# Drizzle outside the infrastructure ring
grep -rlE "from '(drizzle-orm|[./]+db/schema)" server/src/modules | grep -vE "repository(\.ts|/)"

# Raw DB handle used outside repositories / composition root
grep -rn "container\.db" server/src/modules | grep -v "new .*Repository(container.db)"

# Framework or SDK imports in services / helpers
grep -nE "from '(fastify|octokit|openai|@anthropic-ai/sdk|simple-git|@ast-grep/napi|node:fs)" \
  server/src/modules/*/service.ts server/src/modules/*/helpers.ts

# Env reads outside config / adapters
grep -rn "process\.env" server/src/modules

# Cross-module reach-ins
grep -rnE "from '\.\./[a-z-]+/(repository|service)" server/src/modules
```

## Known legacy leaks (2026-10-15)

Not to be "fixed" in unrelated changes — move them when you touch the file for a real reason:

- Drizzle in routes: `pulls/routes.ts`, `settings/routes.ts`, `polling/routes.ts`, `workspace/routes.ts`
- Drizzle in application code: `reviews/run-executor.ts`, `reviews/diff-loader.ts`,
  `settings/feature-models.ts`, `repos/helpers.ts`
- Services construct their own repository from `container.db` (`repos/service.ts`, …)
