---
name: onion-architecture
description: Use when writing or moving backend code in server/ or reviewer-core/ — adding a module, route, service, repository, adapter, job handler, domain rule, constant or Zod contract; refactoring a fat routes.ts; calling another module; adding an external SDK (LLM, GitHub, git, Slack…); wrapping several writes in a transaction; deciding what a file may import. Enforces Onion Architecture (dependencies point inward only) for Fastify + Drizzle + Zod, checked by `pnpm arch` (dependency-cruiser).
metadata:
  version: "1.0.0"
  updated: "2026-09-19"
---

# Onion Architecture (server + reviewer-core)

## Overview

**One rule:** source dependencies point **inward only**. The core (domain) knows nothing about Fastify, Drizzle, Postgres, or any SDK. The outer rings implement interfaces the inner rings define. The database is not the center. It is an outer detail.

The rings map onto the file names we already use. **Don't add `domain/`, `application/` or `infrastructure/` folders.** The file's role decides its ring.

Enforced by `cd server && pnpm arch` (dependency-cruiser, `server/.dependency-cruiser.cjs`). Existing violations are frozen in `.dependency-cruiser-known-violations.json`. **Never regenerate the baseline to make your change pass.** Fix the import instead.

Out of scope, use the sibling skills: Fastify API details (`fastify-best-practices`), Drizzle query syntax (`drizzle-orm-patterns`), table design (`postgresql-table-design`), Zod API (`zod`). Per-tool rules for *this* architecture: [tools.md](tools.md).

## Step 1: classify the code → ring

| Ring | Files | May import | Must NOT import |
|---|---|---|---|
| **Domain** (center) | `modules/<m>/model.ts`, pure `helpers.ts`, `constants.ts`, pure rule files (`pulls/status.ts`, `total-cost.ts`); `vendor/shared/contracts/*`; `vendor/shared/adapters.ts` (**ports**); `platform/errors.ts`; **all of `reviewer-core/src`** | other domain files, `zod`, `import type` of row types | `fastify`, `drizzle-orm`, `src/db/*` values, `src/adapters/*`, `platform/container`, any SDK |
| **Application** | `service.ts`, `run-executor.ts`, job handlers | domain, ports, **its own** `repository.ts`, `Container` (as the source of ports and shared repos) | `drizzle-orm`, `db/schema`, SDKs, another module's internals |
| **Infrastructure** | `repository.ts` / `repository/*.repo.ts`, `src/adapters/**`, `src/db/**` | domain, `drizzle-orm`, SDKs | application, routes |
| **Presentation** | `routes.ts`, `_shared/context.ts`, `_shared/schemas.ts` | its module's service, contracts, errors | `drizzle-orm`, `src/db/*`, `src/adapters/*`, SDKs |
| **Composition root** | `platform/container.ts`, `app.ts`, `server.ts`, `modules/index.ts` | everything. It is the **only** place that `new`s concrete adapters | (nothing imports `app.ts`/`server.ts`) |

Classifying a piece of code:
- **Would it still be true with no HTTP, no DB and no network?** ("stale after 7 days", cost = tokens × price, severity rollup.) → **Domain**. Put it in a pure function with its constants next to it.
- **Does it orchestrate:** load, decide, call a port, persist, enqueue? → **Application** (`service.ts`).
- **Does it speak SQL or an SDK?** → **Infrastructure**: `repository.ts` for SQL, `src/adapters/<name>/` for an SDK.
- **Does it read `req`/`reply` or set status codes?** → **Presentation** (`routes.ts`), and nothing else goes there.

## Step 2: place it

- **New module** = `src/modules/<kebab>/` with `routes.ts` (default-export Fastify plugin), `service.ts`, `repository.ts`, `helpers.ts`/`constants.ts` as needed. Then **register it in `src/modules/index.ts`**. No other file registers routes.
- **Before you write a new schema or enum**, grep `vendor/shared/contracts/` (`Severity`, `IdParams`, …) and reuse what's there. Before editing a `vendor/shared` file, `diff` the server and client copies, because some files have already drifted (see `server/INSIGHTS.md`).
- **Every table has one owning module**, and only that module's repository **writes** it (`findings`/`reviews` belong to `reviews`, `agents`/`agent_runs` belong to `agents`). A new module that needs to change another module's rows **adds a method to the owner's repository** and calls it via `container.<x>Repo`. A **read-only join or select** for your own read model (e.g. `pulls` reading `repos.owner`/`repos.name`, or `findings` rows for counts) is fine inside your own `repository.ts`. `pnpm arch` can't see this rule, so check it yourself.
- **A business rule that is naturally a `WHERE`** (accepted and not dismissed, stale > 7 days) lives in SQL, in a repository method **named after the rule** (`exportableFindings`, `listStale`). The threshold constant sits in the owning module's `constants.ts`, and the repo imports it. If the same rule is also needed in memory, add a pure predicate next to the constant, and let a test pin that the two agree.
- **Row → DTO mapping** is a pure function in `helpers.ts` (`toRepoDto` in `modules/repos/helpers.ts` is the reference for the *shape*). It takes row types via `import type { XRow } from './repository.js'`. Don't copy the `import * as t from '../../db/schema.js'` that `repos/helpers.ts` still does: that line is baseline debt. The repository returns rows, the service maps them, and the route returns the DTO.
- **Domain rule used by 2+ modules** stays in the owning module and is exported from its **`index.ts`**. It moves to `_shared/` only when no module owns it.
- **Another module's data or behavior:** use `container.<x>`, which exposes shared repos and facades (`agentsRepo`, `reviewRepo`, `repoIntel`), or the other module's `index.ts`. **Never** `../<other>/repository.js`, `../<other>/constants.js` or `../<other>/repository/*.repo.js`. A module's `index.ts` is its **public API**: domain types, constants, pure rules, and the facade/service. It doesn't re-export `repository.ts` or `routes.ts` (`repo-intel/index.ts` does today, which is debt). A module that has no `index.ts` yet gets one when it gains its first outside consumer.
- **New external system** (SDK, API, CLI): add a port in `server/src/vendor/shared/adapters.ts` (the server copy only: ports are server-side, and the client never calls an SDK), an adapter in `src/adapters/<name>/`, a mock in `src/adapters/mocks.ts`, and a lazy getter plus an `overrides` field in `Container`. The adapter translates SDK errors into `ExternalServiceError`.
- **reviewer-core needs a capability** (token counting, clock, LLM): reviewer-core **defines the port itself** (`export interface Tokenizer { count(text: string): number }`) and receives it as a parameter. The server passes its adapter in. Never add a server-side dependency to reviewer-core.

## Step 3: check the direction

Before you finish, list every new `import` and ask whether it points inward. Then run:

```bash
cd server && pnpm arch
```

A failure names the rule (`no-db-outside-infra`, `routes-thin`, `domain-pure`, `sdk-only-in-adapters`, `no-cross-module-internals`, `reviewer-core-pure`, …). Move the code to the right ring. Don't silence the rule.

The red-flag examples below are real **baseline debt** that already exists in the code. Examples: `repos/service.ts → repo-intel/constants.js`; drizzle in `pulls/`, `polling/`, `workspace/` and `settings/routes.ts`; `reviews/service.ts`. Existing code is **not** a reference just because it exists. `modules/repos/` is the reference module.

**Touching a module with no `service.ts`/`repository.ts`** (`polling`, `workspace`, `settings`)? Create them for the piece you add or change, and leave the rest of the route as it is.

**Touching a file that's in the baseline?** Don't widen the violation. If your change is in the same function, move that piece to the right ring (a small extract to `repository.ts` or `service.ts` is in scope). A full cleanup of the module is a separate task.

## Transactions

- As of 2026-09 there are **zero** `db.transaction` call sites in `server/src`, so the first one introduces the pattern below. Don't go looking for a reference implementation.
- The **service owns the boundary**: `this.container.db.transaction(async (tx) => { … })`. The repositories do the work inside it.
- Repository methods that must join a tx take an **optional last parameter** `tx?: DbExecutor` and use `(tx ?? this.db)`. Add `export type DbExecutor = Db | Parameters<Parameters<Db['transaction']>[0]>[0];` to `src/db/client.ts` the first time you need it. This works for cross-module repos too: `container.agentsRepo.completeRun(id, patch, tx)`. You don't `new` another module's repository class.
- **No external I/O inside a transaction** (LLM, GitHub, git, Slack, `jobs.enqueue`). Call out first and write the DB in one short tx afterwards, or write the DB first and enqueue after commit. A tx that holds a pooled connection across the network starves the pool.
- **A loop of external side effects** (posting N GitHub comments, N LLM calls): **idempotency beats batch atomicity.** Persist each item's result right after its call succeeds (one small write per item, no wrapping tx), and make the selection query skip items that are already done (`isNull(exportedAt)`). A crash then leaves a consistent "done so far" state, and a retry doesn't duplicate anything. Use a single transaction only when **all** the writes are DB-only.

## Red flags

| You're about to… | Instead |
|---|---|
| `import { eq } from 'drizzle-orm'` or `* as t from '../../db/schema.js'` in `routes.ts` / `service.ts` / `helpers.ts` | Add a method to the module's `repository.ts`. |
| put an `if`/loop business decision in a route handler | Move it to the service or a pure domain function. The route does parse → `getContext` → service → status only. |
| `new Octokit(…)`, `new OpenAI(…)`, or read `secrets.get('…TOKEN')` in a module | Use `await container.github()` / `container.llm(…)`. If a method is missing, add it to the port and the adapter. |
| `import … from '../reviews/repository/…'` or `'../repo-intel/constants.js'` | Use `container.reviewRepo` / `container.repoIntel`, or `../repo-intel/index.js`. |
| `new AgentsRepository(tx)` inside another module | Pass `tx` to `container.agentsRepo.method(…, tx)`. |
| filter rows in JS after the query, or check `row.workspaceId !== workspaceId` in the service | Put the predicate and the `workspaceId` scope in the SQL `where`. |
| call GitHub or the LLM inside `db.transaction` | Call out first, then run a short tx. |
| re-`parse` a Zod schema inside the service on already-validated data | Parse once at the boundary (route, adapter, env). Inside, use `z.infer` types. |
| hand-write a wire type (`type PrMeta = {…}`) | Use `z.infer` of the contract in `vendor/shared/contracts`. |
| add a new SDK/`fastify`/`drizzle-orm` dependency to reviewer-core, or import `server/…` from it | Define a port in reviewer-core and inject the implementation from the server. (`reviewer-core/src/llm/openrouter.ts` is the one existing SDK adapter there; it's the only exception.) |
| write an interface for a repository with one implementation | Don't. Ports exist for external systems. Repos are concrete classes behind the service. |
| run `pnpm arch:baseline` so your change passes | Fix the import. The baseline only shrinks. |
