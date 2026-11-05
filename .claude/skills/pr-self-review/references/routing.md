# Routing — which skill reviews which file

Machine-readable source of truth: [`routing.json`](routing.json) (read by `scripts/collect-diff.mjs`).
This file explains it. A changed file gets the **union** of skills of every rule it matches.

| Bucket | Files | Skills | Why |
|---|---|---|---|
| ui | `client/src/**/*.{ts,tsx}` (not tests, not `vendor/`) | `frontend-ui-architecture`, `react-best-practices`, `next-best-practices` | structure, React anti-patterns, App Router/RSC |
| ui-tests | `client/**/*.test.{ts,tsx}`, `client/src/test/**` | `react-testing-library` | test style; UI rules on tests are noise |
| backend | `server/src/{modules,platform,adapters}/**`, `app.ts`, `server.ts` | `onion-architecture` | layering |
| backend-http | `routes.ts`, `schemas.ts`, `modules/_shared/**`, `platform/**`, `app.ts`, `server.ts` | `fastify-best-practices` | only where Fastify is actually used |
| backend-db | `server/src/db/schema/**`, `schema.ts` | `drizzle-orm-patterns`, `postgresql-table-design` | table design |
| backend-db | `*repository*.ts`, `server/src/db/**`, any server file importing `drizzle-orm` | `drizzle-orm-patterns` | queries |
| reviewer-core | `reviewer-core/src/**` | `typescript-expert`, `zod` | pure TS engine + contracts |
| fullstack | every code file (`ts/tsx/js/mjs/cjs`) | `security` | always |
| fullstack | file imports `zod`, or `**/contracts/**` | `zod` | |
| fullstack | `tsconfig*.json`, or added lines declare types/generics/`any`/`satisfies`/`as unknown as` | `typescript-expert` | only when types actually change |
| ci | `.github/workflows/**`, `.env*`, `docker-compose*.yml`, `Dockerfile*` | `security` | secrets, permissions |
| docs | `*.md`, `docs/**` | — | only the policy checks apply |

**Ignored by skills** (policy checks still apply): markdown, lockfiles, `server/src/db/migrations/**`,
`*/src/vendor/shared/**`, `server/clones/**`, vendored `.claude/skills/<x>/**`, `skills-lock.json`,
`server/architecture-baseline.json`, binaries.

**Never run:** `mermaid-diagram` (generates diagrams), `engineering-insights` (wrap-up), `pr-self-review`.

**`e2e/`** gets `security` only (via fullstack) — no e2e-specific skill exists.

## Adding a skill

1. Add a rule (or a skill to an existing rule) in `routing.json`, or put it in `neverRun`.
2. Add a row above. Until then every run prints `WARN unrouted skill: <name>`.
3. A skill listed in `routing.json` but missing on disk prints `WARN skill not found` and is skipped —
   copying a skill list from another repo cannot silently "pass".
