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

### Checks (per package — run inside the package dir)

| Package    | Tests                                            | Typecheck         | Lint |
|------------|--------------------------------------------------|-------------------|------|
| `server/`  | `pnpm test` (or `pnpm exec vitest run --exclude '**/*.it.test.ts'` for unit-only; `.it.test` needs Docker) | `pnpm typecheck` | — (no linter configured) |
| `client/`  | `pnpm test` (vitest + jsdom, fetch mocked)       | `pnpm typecheck`  | — (no linter configured) |
| `reviewer-core/` | `npm test`                                 | `npm run typecheck` | — |
| `e2e/`     | `npm test` (needs `./scripts/e2e.sh` stack)      | `npm run typecheck` | — |

### Do not touch

- **Applied DB migrations** (`server/src/db/migrations/`) — never edit or
  re-generate an applied migration; add a new one (`pnpm db:generate` in
  `server/`). Migrations are append-only history.
- **Lockfiles** (`server/pnpm-lock.yaml`, `client/pnpm-lock.yaml`,
  `reviewer-core/package-lock.json`, `e2e/package-lock.json`) — never edit by
  hand or regenerate casually; they're the reproducible-install contract.
  Dependency changes go through the package manager (`pnpm install <pkg>` /
  `npm install <pkg>`), never manual lockfile edits.

## Naming conventions

- **Components** — `PascalCase.tsx` matching the default export
  (`ReviewRunAccordion.tsx` exports `ReviewRunAccordion`); colocated folder per
  feature component (`_components/<Name>/`) with `index.ts` barrel.
- **Files** — `kebab-case.ts` for non-component modules (`repo-intel`,
  `price-book`); colocated `styles.ts` / `constants.ts` / `helpers.ts` export
  an `s` / constants / pure functions respectively.
- **Tests** — colocated next to the unit: `<Name>.test.tsx` (client/server
  unit); DB-backed server tests MUST end in `*.it.test.ts`; e2e flows are
  `specs/NN-name.flow.json`.
- **API routes** — kebab or `:param` paths as declared in each module's
  `routes.ts`; Zod schemas for params/body live in `src/modules/_shared/schemas.ts`.
- **DB (Drizzle)** — snake_case columns, camelCase TS fields; tables plural
  (`agent_runs`, `pull_requests`); never rename an existing column.
- **Contracts** — `@devdigest/shared` Zod schemas in `vendor/shared/contracts/`,
  types derived via `z.infer`, vendored identically into `server/` and `client/`.
- **Git commits** — Conventional Commits (`feat:`, `fix:`, `refactor:` …),
  scope in parens when it helps (`feat(reviews): …`).

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
