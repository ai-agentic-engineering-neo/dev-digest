# CLAUDE.md — DevDigest

Local-first AI pull-request review (course starter). Four standalone packages,
**no monorepo workspace**: each has its own `package.json` and lockfile;
cross-package code is consumed through tsconfig path aliases (`@devdigest/shared`,
`@devdigest/ui`, `@devdigest/reviewer-core`), never published.

## Repo map

| Path             | Package                   | Role                                                        | Port |
|------------------|---------------------------|-------------------------------------------------------------|------|
| `server/`        | `@devdigest/api`          | Fastify 5 API + Drizzle over Postgres (pgvector); repo-intel | 3001 |
| `client/`        | `@devdigest/web`          | Next.js 15 studio (App Router, React 19, TanStack Query)    | 3000 |
| `reviewer-core/` | `@devdigest/reviewer-core`| Pure review engine: diff → prompt → LLM → grounded findings | —    |
| `e2e/`           | `@devdigest/e2e`          | Deterministic browser e2e (agent-browser, no LLM)           | —    |

Shared Zod contracts (`@devdigest/shared`) are vendored at
`server/src/vendor/shared` and `client/src/vendor/shared` — keep the copies in
sync when contracts change.

## Environment & commands

- Node ≥ 22. **pnpm** in `server/` and `client/`; **npm** in `reviewer-core/` and `e2e/`.
- pnpm ≥ 10 blocks dependency build scripts by default; approvals live in each
  package's `pnpm-workspace.yaml` (`allowBuilds`), not in `package.json`.
- `./scripts/dev.sh` — Postgres (Docker) + migrations + seed + API + web.
- `./scripts/e2e.sh` — hermetic e2e stack (isolated ports, fresh seed, auto-teardown).
- Only Postgres runs in Docker; the API and web app run on the host.

## Golden rules

- Don't propose a monorepo/workspace toolchain — standalone packages are deliberate.
- Testing strategy: read [`TESTING.md`](TESTING.md) before adding tests. Server
  suites split by filename: `*.it.test.ts` = DB-backed (testcontainers),
  everything else hermetic.
- Docs convention: every module keeps `README.md` + `docs/` + `specs/` +
  `INSIGHTS.md`; CLAUDE.md links to them and never duplicates their content.
  In `e2e/`, `specs/` is the executable agent-browser flows (JSON).
- End of a substantial session → apply the
  [engineering-insights](.claude/skills/engineering-insights/SKILL.md) skill:
  capture new non-obvious insights into the touched modules' `INSIGHTS.md`.
- Review findings are grounded mechanically and the score is recomputed from
  surviving findings — the model's self-reported score is never trusted.

## Read when …

- Making any cross-module change → read [`docs/architecture.md`](docs/architecture.md) first.
- Adding or changing an API route → read [`server/README.md`](server/README.md)
  (request & DI flow, API map, env).
- Touching prompt assembly, grounding, or structured output → read
  [`reviewer-core/README.md`](reviewer-core/README.md).
- Adding a UI screen or data hook → read [`client/README.md`](client/README.md)
  (route map, hooks ↔ API surface).
- Writing or debugging browser flows → read [`e2e/README.md`](e2e/README.md)
  (flow format, hermetic runner).
- Starting work in a module → read that module's `INSIGHTS.md` first — always
  before a task, especially when debugging something non-obvious.
- Designing or changing a feature → check the module's `specs/` for an existing
  behavior spec; if one exists, update it in the same PR.
