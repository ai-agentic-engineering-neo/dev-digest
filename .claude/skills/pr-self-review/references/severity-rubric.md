# Severity rubric

One scale for every skill. When in doubt between two levels, pick the **lower** one — a critical
blocks the PR, so it must be something a reviewer would refuse to merge on sight.

| Level | Meaning | Blocks? |
|---|---|---|
| `critical` | Merging this causes a security hole, data loss, a broken build/contract, or breaks a hard project rule | **Yes** |
| `major` | Real defect or rule violation that should be fixed in this PR, but the app still works | No |
| `minor` | Maintainability / convention issue | No |
| `nit` | Style, naming, taste | No |

Only findings on **lines this diff adds or changes** count. Problems in untouched code are reported as
pre-existing and never block. A model critical needs a verbatim `evidence` quote from the file and
`confidence ≥ 0.7`, and must survive the verification pass — otherwise it is downgraded to `major`.

## Critical — per skill

Anything not listed here is at most `major`.

| Skill | Critical when the diff… |
|---|---|
| `security` | adds an injection sink with user input (SQL built by string, `dangerouslySetInnerHTML` with untrusted data, shell/`exec` with input); a route that reads or mutates workspace data without workspace scoping/auth context; a hard-coded secret; logs secrets/tokens; disables TLS/CSRF/CORS protections; path traversal on user-supplied paths |
| `onion-architecture` | `routes.ts` uses Drizzle / `db/schema` / a repository / `container.db` directly; `service.ts` or `helpers.ts` imports `fastify`, Drizzle or an SDK; `reviewer-core` gains DB/GitHub/filesystem access; an adapter is `new`ed outside `platform/container.ts` in a way tests can't override |
| `fastify-best-practices` | a route with no Zod schema on body/params that reaches the DB; an unhandled promise / missing `await` that leaks a response or crashes the process; business errors sent with `reply.status()` that bypass the error envelope **and** leak internals (stack, SQL) |
| `drizzle-orm-patterns` | a query on workspace-owned data without `workspaceId` filter; multi-step writes that must be atomic but are not in a transaction; raw `sql` with interpolated user input |
| `postgresql-table-design` | an edited or deleted existing migration; a destructive migration (drop/rename column/table) without a data path; a new FK or unique constraint that will fail on existing data |
| `zod` | a shared contract changed in only one of `server/src/vendor/shared` / `client/src/vendor/shared`; a contract change that breaks an existing consumer (removed/renamed required field); `.parse` replaced by an unchecked cast at a trust boundary |
| `next-best-practices` | a server-only module (secrets, DB, `server-only`) imported into a client component; `'use client'` file exporting something that leaks secrets to the bundle |
| `react-best-practices` | a hook called conditionally / in a loop; an effect that loops forever (setState on its own dependency); state mutation that breaks rendering |
| `frontend-ui-architecture` | never critical — placement and structure are `major` at most |
| `react-testing-library` | never critical — a test that always passes (no assertion / awaited nothing) is `major` |
| `typescript-expert` | never critical by itself — `tsc` errors are caught by the static `static/typecheck` check |

## Static checks (deterministic)

| Rule | Severity |
|---|---|
| `static/typecheck` in a changed file · `static/tests` failing | critical |
| `static/route-db-access` · `static/service-infra-import` · `static/reviewer-core-io` | critical |
| `static/migration-edited` · `static/hardcoded-secret` | critical |
| `static/shared-contract-drift` (copies were equal before this change) | critical |
| `static/shared-contract-drift` (copies already differed) · `static/env-in-module` · `static/cross-module-reach-in` · `static/client-direct-fetch` · `static/typecheck` outside the diff | major |

## Project context the reviewer must respect

- Known legacy leaks (Drizzle in `pulls/`, `settings/`, `polling/`, `workspace/` routes, etc. — see
  `onion-architecture/references/review-checklist.md`) are pre-existing: flag only **new** leaks.
- Empty tables and unused contracts for later lessons are expected, not dead code.
- `server/src/vendor/shared` and `client/src/vendor/shared` already drift in some files; flag only
  drift this diff introduces.

## Suppressing a finding

Put this on the flagged line or the line above, with a reason (required):

```ts
// pr-self-review-ignore onion-architecture/route-db-access: legacy route, moved in #123
```

The rule id is the full `rule` (`static/route-db-access`) or its bare name (`route-db-access`), which covers the same rule from every skill. Suppressions are visible in the diff and listed in the report.
