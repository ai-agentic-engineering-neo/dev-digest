# Severity map

Every source has its own scale. The report uses only the project's own
`Severity` enum (`CRITICAL | WARNING | SUGGESTION`, see
`server/src/vendor/shared/contracts/findings.ts`) and blocks on CRITICAL, which
matches `ci_fail_on: 'critical'`.

## Per source

| Source | CRITICAL | WARNING | SUGGESTION |
|---|---|---|---|
| `react-best-practices` | **CRITICAL** rule broken | HIGH | MEDIUM |
| `frontend-architecture` | **MUST** broken *and* it causes a bug or breaks a boundary (see below) | other MUST, SHOULD | AVOID |
| `onion-architecture` | **MUST** broken *and* it breaks the dependency rule or causes a bug (see below) | other MUST, SHOULD | AVOID |
| `next-best-practices` | breaks the build or runtime (server-only code in a client bundle, sync access to async APIs, non-serializable props across the boundary) | wrong pattern with a real cost | style |
| `react-testing-library` | — (tests never block) | test asserts implementation / can't fail | query priority, style |
| `fastify-best-practices`, `drizzle-orm-patterns`, `zod` | data loss, unhandled rejection, unvalidated input reaching the DB, transaction that can leave partial writes | wrong pattern with a real cost | style |
| `postgresql-table-design` | migration that loses data or locks a hot table; missing FK / NOT NULL that the code relies on | missing index on a queried column | naming, types |
| `security` + `security-reviewer` | **HIGH confidence**: vulnerable pattern + attacker-controlled input confirmed | MEDIUM confidence | LOW (normally not reported) |
| `performance-reviewer` | unbounded work on a request path (N+1 over user-sized input, DB connection held across LLM/GitHub calls) | measurable regression | micro-optimisation |
| `check:secrets` | provider-shaped key | generic `secret = "..."` | — |
| `check:contracts` | copies differ | — | — |
| `check:i18n` | key or namespace missing | — | — |
| `check:typecheck` | error in a changed file | errors elsewhere | skipped (no deps) |
| `check:tests` | — | source changed, no test changed in the package | — |
| `check:lint` | — | eslint error on a changed line | — |

## Which architecture MUST is CRITICAL

CRITICAL (blocks):
- **Backend:** domain or application code imports `drizzle-orm`, `fastify`, `db/*`, an SDK or `node:fs`. A route queries Drizzle or calls an SDK directly. One module imports another module's internals. A secret is read outside `SecretsProvider`. A contract is changed in one copy only.
- **Frontend:** a feature imports another feature's internals. Server-only code is imported into a `'use client'` tree. `useEffect` is used for derived state or fetching in a way that produces a visible bug (a flash, a loop, stale data). A page/layout holds the business logic.

Everything else that is a MUST (file placement, folder anatomy, naming, size) is **WARNING**.

## Verification gate

A CRITICAL counts only with `"verified": true`. The verify pass (SKILL.md step 5)
re-reads the code around the line and answers: *is the rule really broken on
this changed line, and would a senior reviewer block the PR for it?*
`write_report.py` downgrades an unverified CRITICAL to WARNING automatically.
