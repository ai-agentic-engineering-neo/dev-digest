# Drizzle/Postgres = infrastructure

Contents: [Repository rules](#repository-rules) · [Row types and mapping](#row-types-and-mapping) · [Transactions](#transactions) · [Workspace scoping](#workspace-scoping) · [Schema and migrations](#schema-and-migrations) · [Repository interfaces](#when-a-repository-interface-is-worth-it) · [Anti-patterns](#anti-patterns)

Drizzle API usage is in `drizzle-orm-patterns`; table design in `postgresql-table-design`. This file covers **where** database code lives and how its types are kept from leaking.

## Repository rules

- **One repository per aggregate/table family**, in `modules/<name>/repository.ts` (large ones may split, as `reviews/repository/{pull,review,run}.repo.ts` does behind a facade). It is the **only** code that imports `drizzle-orm` operators and `db/schema` for that data. [O1][K1]
- It receives `Db` (type from `db/client.ts`) in its constructor — never imports a global client. The container constructs repositories (`container.agentsRepo`, `container.reviewRepo`), so modules share them without reaching into each other's folders.
- Methods are named for **intent** (`listForWorkspace`, `insertVersion`, `findOpenByRepo`), not for SQL.
- It contains persistence logic only: queries, upserts, joins, ordering, pagination. Rules like "is this patch a config change that creates a new version" should be **pure helpers** (`agents/helpers.ts` → `isConfigChange`, no DB). Today `agents/repository.ts` calls `isConfigChange` itself while versioning; that is acceptable because the helper is pure, but the decision ("should we version?") is use-case logic, so new code should have the service call the helper and pass the result down.
- Translate DB errors (unique violation, FK violation) into the shared error taxonomy before they leave. [O4]

## Row types and mapping

- `$inferSelect`/`InferSelectModel` give you the row type from the table. Re-export a named alias from `db/rows.ts` (`AgentRow`, …) — don't re-derive it in every file. [D3]
- **Rows stop at the repository boundary when it matters.** For simple reads where the row *is* the shape the service wants (and no secret/internal columns), returning `AgentRow` to the service is tolerable in this codebase — but then the service must not import `db/schema` just to name columns, and the API response is still mapped by a DTO function (`toAgentDto`), never returned raw. [C1][G1]
- When the row has columns the core shouldn't depend on (internal ids, soft-delete flags, JSON blobs) or shapes differ, return a module-owned type and map inside the repository.
- `import type { AgentRow } from '../../db/rows.js'` in a service is a **type-only** dependency: acceptable short-term, but prefer a module type if it keeps spreading. A value import of `db/schema` in a service is a violation.

## Transactions

State of the repo: **there is no `db.transaction(` anywhere in `server/src` today** (checked 2026-11-23). Multi-step writes — e.g. the per-row PR upsert loop in `pulls/routes.ts` — are not atomic. Don't claim a transaction convention exists.

When a use case needs several writes to succeed or fail together: [D2][S1][O3]
- **The service decides the boundary** (it knows the use case): `await db.transaction(async (tx) => { … })`.
- Repositories accept an optional executor: `method(args, tx?: Tx)` and use `tx ?? this.db`. (Sentry's "atomic repositories".) [S1]
- Nested `tx.transaction` creates a savepoint; `tx.rollback()` aborts. [D2]
- If a service must stay free of Drizzle types even in its signature, wrap this behind an application-owned interface (`Transactions.run(fn)`), implemented in infrastructure. (Allegro's approach.) Do this only when you need the unit-test fake — otherwise `tx` passing is simpler. [O3][S2]
- Never hold a transaction across a slow external call (LLM, GitHub). Do the call first, then open a short transaction to persist.

## Workspace scoping

Every table is workspace-scoped. The presentation ring gets `workspaceId` from `getContext`; services pass it to repositories; **repositories apply it in every `where`** (`and(eq(t.x.workspaceId, workspaceId), …)`). A repository method that takes only an `id` and no `workspaceId` is a tenancy bug unless the id is globally unique *and* already authorized upstream.

## Schema and migrations

- Schema lives in `db/schema/*` (tables for future milestones exist on purpose — empty ≠ dead).
- Migrations are **generated** (`pnpm db:generate`) and applied manually (`pnpm db:migrate`); they do not run on boot. Never hand-edit `db/migrations/**`.
- A schema change is an **infrastructure** change: it ripples inward only through the repository's return types. If a column rename forces edits in services or routes, a row type leaked.

## When a repository interface is worth it

Default (pragmatic): the repository is a concrete class, constructed by the container; unit tests of services use the real class against Postgres (`*.it.test.ts`) or call pure helpers directly.

Add `ports.ts` with a `FooRepository` interface when: [G1][K1][R1]
- a service has real logic you want to unit-test **without Docker**, or
- two implementations exist (e.g. Postgres and an in-memory/file store).
Then the interface lives in the module (inner), the Drizzle class `implements` it, and the container wires it, with a fake in `ContainerOverrides`.

## Anti-patterns

- `import { eq } from 'drizzle-orm'` + `import * as t from '../../db/schema.js'` in `routes.ts`, `service.ts`, `helpers.ts` (today: four routes, plus `run-executor.ts`, `diff-loader.ts`, `settings/feature-models.ts`, `repos/helpers.ts`).
- Repository methods returning query builders or raw rows with relations the caller must understand.
- Business conditions encoded as SQL `where` fragments in the service layer.
- Constructing `new Repo(db)` ad hoc inside services (bypasses the container and tests).
- Transactions opened inside repositories per method — each repo then commits independently and atomicity is impossible. [S1]
- Calling an LLM/GitHub inside `db.transaction`.
