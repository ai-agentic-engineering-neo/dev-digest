# Routing: which skills review which files

Human-readable twin of `scripts/route.sh`. When you change one, change the
other. `route.sh --lanes` prints the result for the current change set.

A **lane** is one package. Each lane is reviewed by one subagent that gets the
lane's diff plus the union of the skills below. One subagent per package keeps
a 100-file branch from overflowing a single reviewer's context, and lets the
frontend and backend reviews run in parallel.

| Files matched | Skills |
|---|---|
| `client/src/**/*.test.ts(x)` | react-testing-library |
| `client/src/**/*.tsx` | react-frontend-architecture, react-best-practices, next-best-practices |
| `client/src/**/*.ts` (not tests) | react-frontend-architecture |
| `client/src/app/**/route.ts`, `client/src/middleware.ts` | next-best-practices |
| `server/src/modules/*/routes.ts`, `server/src/modules/_shared/**`, `server/src/app.ts`, `server/src/server.ts` | fastify-best-practices, onion-architecture-backend |
| `server/src/modules/*/repository*.ts`, `server/src/db/**` (not migrations) | drizzle-orm-patterns, postgresql-table-design, onion-architecture-backend |
| any other `server/src/modules/**`, `server/src/adapters/**`, `server/src/platform/**` | onion-architecture-backend |
| `server/src/vendor/shared/**` | zod (plus the contract-copy precheck) |
| `reviewer-core/src/**` | zod |
| every `.ts` / `.tsx` anywhere | typescript-expert, security |

`security` runs on every source file on purpose: the OWASP checklist is cheap
to apply and the one lane that must not depend on a path guess. The subagent is
told to report only findings it can trace to an input source, per that skill's
confidence table.

## Excluded from skill lanes

These never reach a subagent. `precheck.sh` still looks at most of them.

| Path | Why | Who checks it |
|---|---|---|
| lockfiles | package manager owns them | precheck: lockfile without `package.json` change |
| `server/src/db/migrations/**` | generated | precheck: committed migration modified |
| `client/src/vendor/shared/**` | copy of the server contracts | precheck: `diff -r` against the server copy |
| `client/src/vendor/ui/**` | design system | precheck: warning, must be a design-system task |
| `*.md`, `.github/**`, `.claude/**`, config files | no code lane | precheck: vendored skill edited by hand |
| files no rule matched | unknown | listed in the report under "not routed" so you review them by hand |

## Adding a rule

1. Add the `case` pattern to `skills_of` in `scripts/route.sh`.
2. Add the row above.
3. Run `route.sh --lanes` on a branch that touches the new path and confirm.
