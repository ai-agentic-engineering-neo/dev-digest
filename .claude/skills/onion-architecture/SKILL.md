---
name: onion-architecture
description: "Layering rules for server/ (@devdigest/api) modules under Onion Architecture: domain contracts at the center, services orchestrating business logic, repositories as the sole owners of Drizzle access, routes/adapters as the outer ring — dependencies always point inward. Use when adding a new src/modules/<name>/ module, deciding whether a module needs service.ts/repository.ts, reviewing whether a route handler touches container.db directly, or splitting a growing repository.ts. Before writing or editing anything under src/modules/<name>/, work through enforced.md's checklist and check layer-map.md for that module's current ring status — this is a required gate, not optional background reading. Does NOT cover Fastify mechanics (routing, hooks, schemas) — use fastify-best-practices — or Drizzle query syntax — use drizzle-orm-patterns. Sources and rationale: README.md. Code examples: examples.md."
---

# Onion Architecture

Layering and dependency-direction rules for `server/` (`@devdigest/api`),
calibrated to this repo's actual module layout, not generic advice. For
Fastify routing/plugin/schema mechanics see
[fastify-best-practices](../fastify-best-practices/SKILL.md). For Drizzle
query patterns see [drizzle-orm-patterns](../drizzle-orm-patterns/SKILL.md).
Sources and rationale for every rule below: [README.md](README.md). Code
examples (compliant and anti-pattern, from this repo): [examples.md](examples.md).

## Before touching any module (REQUIRED)

Before writing or editing anything under `server/src/modules/<name>/`, work
through **[enforced.md](enforced.md)**'s checklist — it turns §1–§3 below
into concrete stop/go checks for the edit you're about to make. Look the
module up in **[layer-map.md](layer-map.md)** first, so you know whether
you're extending a compliant module or starting from known debt. These two
files are a gate on this skill's rules, not supplementary reading — treat
skipping them the same as skipping the rules themselves.

## Severity levels

- **CRITICAL** — will produce an untestable coupling or a broken
  dependency-injection seam that's expensive to unwind later
- **HIGH** — will hurt maintainability or consistency as modules grow

---

## 1. The rings, mapped onto `server/` (CRITICAL)

Four rings. Dependencies point inward only — an outer ring may import an
inner one, never the reverse.

| Ring | Lives at | Depends on |
|---|---|---|
| Domain contracts (center) | `src/vendor/shared/` (Zod schemas + inferred types) | nothing |
| Application / services | `modules/<name>/service.ts` | domain contracts |
| Data access / adapters | `modules/<name>/repository.ts`, `src/adapters/*` | domain contracts only |
| HTTP / infrastructure (outer) | `modules/<name>/routes.ts`, `src/platform/container.ts` | everything inward |

Two concrete consequences, both already true for well-formed modules in this
repo (`repo-intel`, `reviews`) and both violated by the routes-only modules
(`pulls`, `settings`, `polling`, `workspace`):

- **A route handler never imports Drizzle** (`../../db/schema.js`,
  `drizzle-orm` operators) or calls `container.db` — it calls a service (or,
  for a single trivial read, a repository directly). Persistence details
  don't belong in the HTTP layer.
- **A service never imports a concrete adapter class directly**
  (`src/adapters/openrouter.ts`, etc.) — it goes through `container.<adapter>`.
  This is `server/CLAUDE.md`'s existing "services never call an external
  adapter directly" rule, restated as the outer-ring/inner-ring dependency
  direction, plus its missing counterpart for the database.

`src/vendor/shared` is the innermost ring on purpose: it's imported by
routes (Zod `params`/`body` schemas), services, and the client — it must
never import anything module-specific, or the dependency arrow reverses.

## 2. The threshold rule for `repository.ts` (CRITICAL)

`server/CLAUDE.md` currently documents `service.ts`/`repository.ts` as
*optional* per module. That wording is why 4 modules collapsed all three
rings into `routes.ts`. This skill makes the threshold concrete:

> The moment a module's `routes.ts` (or any handler in it) needs
> `container.db` for anything beyond zero calls, that access moves into a
> `repository.ts`, and business logic beyond a single pass-through query
> moves into a `service.ts` that calls it. A module may stay routes-only
> **only if it performs no persistence at all.**

This is grep-checkable:

```sh
grep -rln "container.db" server/src/modules/*/routes.ts
```

Today that returns `pulls`, `settings`, `polling`, `workspace` — all four
touch `container.db` directly in `routes.ts` with no repository layer.
These are known debt (not fixed by this skill), listed here so the rule
catches them the next time one of those files is touched rather than
silently perpetuating the pattern. See [examples.md](examples.md) for the
specific anti-pattern in `pulls/routes.ts` (a GitHub-sync upsert loop
embedded directly in a handler) contrasted with `repo-intel`'s compliant
`routes.ts → service.ts → repository.ts` split.

## 3. When to split `repository.ts` into a `repository/` folder (HIGH)

Two precedents in this repo:

- `repo-intel/repository.ts` — single file. The module owns one
  aggregate (symbols/references for a repo).
- `reviews/repository/{pull,review,run}.repo.ts` — split by aggregate. The
  module owns three distinct aggregates (pulls, reviews, runs) that would
  otherwise crowd one file with unrelated queries.

Split when a module's repository spans more than one distinct
aggregate/table-group — not by line count alone.

## 4. Naming conventions (HIGH)

Restated from `server/CLAUDE.md` (this skill is the natural place to check
them while adding a module):

- Module folders: `kebab-case`, one noun/feature per folder
  (`src/modules/repo-intel/`). Always exports `routes.ts`; adds
  `service.ts`/`repository.ts` once §2's threshold is crossed.
- Files: `kebab-case.ts` (`price-book.ts`, `run-executor.ts`).
- Classes: `PascalCase`, suffixed by role — `*Repository`, `*Service`,
  `*Executor`, `*Provider`, `*Error` (`ReviewRepository`, `NotFoundError`).

## 5. Anti-pattern quick table

| Anti-pattern | Why it's wrong | Example |
|---|---|---|
| `container.db` called in `routes.ts` | Fuses HTTP + persistence; the query can't be unit-tested without a live route | `modules/pulls/routes.ts`, `modules/settings/routes.ts`, `modules/polling/routes.ts`, `modules/workspace/routes.ts` |
| Business logic (upsert/sync loops) embedded in a handler | Only integration-testable; can't be exercised without a real/mocked HTTP request | `modules/pulls/routes.ts`'s GitHub PR sync loop |
| Service importing a concrete adapter class directly | Breaks the DI/mocking seam `src/adapters/mocks.ts` relies on for tests | — (rule already in `server/CLAUDE.md`) |
| Hand-duplicating a contract shape instead of importing `src/vendor/shared` | Drifts silently from the client's mirrored copy of the same contract | — |
| Repository importing another module's repository | Crosses the data-access ring sideways instead of composing at the service layer | — |

## When routes-only genuinely is fine

Not every module needs three files. A module with zero persistence — e.g.
a pure proxy endpoint or a static-config responder — stays a single
`routes.ts`. The rule in §2 is about persistence, not file count: don't add
an empty `service.ts`/`repository.ts` scaffold "for consistency" if the
module never touches `container.db`.
