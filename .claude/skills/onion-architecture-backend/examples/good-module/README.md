# Example module: `skills`

A complete server module that passes every rule. It manages the `skills`
table that already exists in `db/schema/skills.ts` but has no module yet, so
the files compile against the real schema. To use it, copy the folder to
`server/src/modules/skills/`, add the two container lines from
`container.snippet.ts`, register it in `modules/index.ts`, and move
`service.test.ts` and `routes.test.ts` to `server/test/`. Verified 2026-09-25:
typecheck, `pnpm lint:arch`, six tests and lint all pass with the module installed.

| File | Ring | Imports |
|---|---|---|
| `ports.ts` | 1 | `./constants` only |
| `constants.ts` | 2 (pure) | nothing |
| `helpers.ts` | 2 (pure) | nothing |
| `service.ts` | 2 | `platform/errors`, `./ports`, `./helpers`, `./constants` |
| `repository.ts` | 3a | `drizzle-orm`, `db/client`, `db/schema`, `./ports` |
| `routes.ts` | 3b | fastify, zod, `_shared/*`, `./service`, `./constants` |
| `service.test.ts` | test | service + fake port, no Docker |
| `routes.test.ts` | test | `buildApp` + `inject()` with `auth` and `skillsRepo` overrides, no Docker |
| `container.snippet.ts` | root | the getter and override key to add to `platform/container.ts` |
