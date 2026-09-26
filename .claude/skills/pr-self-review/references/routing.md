# Routing: which skill reviews which file

A reviewer loads **only the sections listed** for the files it actually got, not
whole skills. Paths are relative to the repo root. When a file matches several
rows, it gets the union. Always-on rows apply to every file of that area.

Files with kind `doc`, `lockfile` or `other` in `collect-diff.sh` output are not
reviewed (list them in the report as "not reviewed"). `protected` files are
handled by `precheck.sh` only.

## Frontend reviewer — `client/**`, `e2e/**`

| Files | Skill → sections to load |
|---|---|
| always | `frontend-ui-architecture` → §3 Where does X go, §4 Where business logic lives, §6 Import rules, §8 Structural review checklist · `client/CLAUDE.md` (Non-default conventions) |
| `*.tsx` components and `use*.ts(x)` hooks | `react-best-practices` → sections tagged CRITICAL and HIGH (skip MEDIUM unless the diff is about it) |
| `client/src/app/**` (`page.tsx`, `layout.tsx`, `error.tsx`, `route.ts`), any file with `'use client'` or `server-only` | `next-best-practices` → RSC Boundaries, Directives, Async Patterns, Error Handling, Route Handlers; `frontend-ui-architecture` → §7 |
| `client/src/lib/hooks/**`, `client/src/lib/api.ts` | `client/docs/ui-architecture.md` (cache keys, error-UX taxonomy) |
| `*.test.ts(x)` | `react-testing-library` → Query Priority, Async Testing, Mocking Strategies, Anti-Patterns · `TESTING.md` |
| files importing `zod` | `zod` → see the Zod 3 caveat below |
| data sent to or read from the API, HTML rendering, URLs built from input | `security` → A01, A05, Framework Security Quirks |
| `client/src/vendor/shared/**` | contract rules below |
| `e2e/**` code | `TESTING.md`, `e2e/CLAUDE.md` |
| `client/messages/**/*.json` | only check that keys added in code exist here (next-intl) |

## Backend reviewer — `server/**`, `reviewer-core/**`

| Files | Skill → sections to load |
|---|---|
| always (`server/`) | `onion-architecture` → §2 rings table, §3 dependency rule, §5 ring by ring, §11 checklist · `server/CLAUDE.md` |
| `server/src/modules/*/routes.ts`, `server/src/app.ts`, plugins | `fastify-best-practices` → rules/routes.md, rules/schemas.md, rules/error-handling.md, rules/plugins.md |
| `server/src/modules/*/repository*.ts`, `repository/**`, `server/src/db/**` (not migrations), `server/src/adapters/**` touching the DB | `drizzle-orm-patterns` → references/queries-joins-aggregations.md, references/transactions.md · `onion-architecture` → §6 + references/transactions.md |
| `server/src/db/schema/**` | `postgresql-table-design` → Core Rules, Constraints, Indexing · check `workspace_id` on new domain tables |
| `service.ts`, `run-executor.ts`, `findings.ts` | `onion-architecture` → §5 Application, §6, §7 |
| `server/src/adapters/**` | `onion-architecture` → §5 Infrastructure; `security` → Secret Detection |
| `server/src/vendor/shared/**` | contract rules below |
| files importing `zod` | `zod` → see the Zod 3 caveat below |
| routes, auth, anything taking user input, shelling out (git, ripgrep, ast-grep) | `security` → A01, A05, A07, Agentic AI Security |
| `reviewer-core/**` | `onion-architecture` → §2 note on reviewer-core (pure domain, no server knowledge) · `reviewer-core/CLAUDE.md` · `docs/agent-prompts/` when prompts change |
| `*.test.ts`, `*.it.test.ts` | `TESTING.md`; `onion-architecture` → §8 Testing by ring |
| any `.ts` | `typescript-expert` → Code Review Checklist (only type-safety items: `any`, unsafe casts, non-null assertions hiding a real null) |

## Contracts (both reviewers)

- The canonical copy is `server/src/vendor/shared`. `precheck.sh` already flags a
  touched file whose twin was not touched (`contract-copy`, MAJOR); the reviewer
  decides whether the other copy really needs the edit.
- A field removed or renamed in a contract the client reads → MAJOR at least.

## Zod 3 caveat

The `zod` skill is written against Zod 4 (it links the v4 release notes, has a
`perf-zod-mini` rule). This repo is **Zod 3** (`^3.24`, 3.25 installed). Ignore any
advice that exists only in Zod 4 — `zod/mini`, top-level `z.email()` /
`z.url()`, `z.strictObject()`, `.check()`, `z.toJSONSchema()`, the `error:`
param. Never propose migrating to it; proposing it is itself a finding.

## Always, both reviewers

- `INSIGHTS.md` of the touched package + the root one: every entry whose path is in
  the diff is a rule to check explicitly (null-vs-zero cost, findings tenancy
  join, `waitForPrRuns` returning on timeout, money formatting, …).
- `references/coupled-files.md`.
