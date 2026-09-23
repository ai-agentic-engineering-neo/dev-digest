# DevDigest — CLAUDE.md

Course starter: local-first AI pull-request review. The repo is 4 independent
packages (NOT a monorepo, no workspaces) — each with its own `package.json`,
lockfile, and its own `CLAUDE.md`.

## Read when

- Working inside a specific module → read `<module>/CLAUDE.md` (`client/`,
  `server/`, `reviewer-core/`, `e2e/`) — it has that module's stack, commands,
  gotchas, and do-not-touch zones. Claude Code auto-loads it whenever it
  touches a file inside that folder.
- Need to understand how the modules talk to each other (diff → repo-intel →
  reviewer-core → LLM → findings), or why this isn't a monorepo →
  read [docs/architecture.md](docs/architecture.md).
- Need the API route contracts → read [server/README.md](server/README.md).
- Need past decisions/lessons for a specific module → read
  `<module>/INSIGHTS.md` (written by the `engineering-insights` skill).
- Need to run the project from scratch → read [README.md](README.md) (Quick
  start section) or just run `./scripts/dev.sh`.

## Session protocol

Work runs as a 5-phase cycle — Initiation → Planning → Implementation →
Validation → Completion — where each phase leaves an artifact in the repo.
Full description, with a worked example → [docs/workflow.md](docs/workflow.md).

- Before non-trivial work in a module, read its `INSIGHTS.md`; treat entries as
  high-confidence unless the code contradicts them.
- Planning phase: write `<module>/specs/<feature>.md` BEFORE the code, and
  record the rejected alternative with its reason, not just the choice.
- Ending a task that involved a problem, a decision or a discovery → run
  `engineering-insights`. Don't skip it; that's how the next session learns.
- `INSIGHTS.md` is append-only: correct a wrong entry with a new dated one,
  never by overwriting.

## Modules

- [client/](client/CLAUDE.md) — Next.js 15 studio, `:3000`
- [server/](server/CLAUDE.md) — Fastify API + Postgres/pgvector, `:3001`
- [reviewer-core/](reviewer-core/CLAUDE.md) — pure review engine (diff → LLM → findings)
- [e2e/](e2e/CLAUDE.md) — deterministic browser tests (agent-browser)

## Naming conventions

Repo-wide. Module-specific additions live in each `<module>/CLAUDE.md`.

- **Case by layer.** On the wire (JSON, Zod contracts in `*/vendor/shared`) and
  in SQL — `snake_case` (`cost_usd`, `findings_by_severity`, `agent_runs`). In
  TypeScript — `camelCase` (`costUsd`, `findingsBySeverity`). The mapping is
  explicit at the boundary; never rename a wire field to make it match TS.
- **Enum values on the wire are `UPPER_CASE`** — `CRITICAL | WARNING |
  SUGGESTION` (`*/vendor/shared/contracts/findings.ts`). Lowercase only for
  the i18n key derived from them (`severity.critical`).
- **React components** — `PascalCase`, one folder per component, file named
  after it: `_components/<Name>/<Name>.tsx` plus its colocated
  `<Name>.test.tsx`, and `styles.ts` / `helpers.ts` / `constants.ts` /
  `index.ts` as needed (example: `client/src/.../_components/FindingsPanel/`).
  Shared, non-route components live in `client/src/components/<kebab-name>/`.
- **Hooks** — `useThing()`, grouped by domain in `client/src/lib/hooks/<domain>.ts`
  (`reviews.ts`, `agents.ts`), not one file per hook.
- **Server modules** — `src/modules/<name>/` with fixed role-named files:
  `routes.ts`, `service.ts`, `repository/<entity>.repo.ts`, `helpers.ts`.
- **Tests** — `*.test.ts(x)` next to the code in `client`, in `server/test/` on
  the server; integration tests that need Docker are `*.it.test.ts` (the unit
  run excludes that suffix).
- **Migrations** — `NNNN_<slug>.sql`, generated (never hand-named) by
  `pnpm db:generate`.
- **e2e flows** — `e2e/specs/NN-name.flow.json`, numbered in run order.
- **Docs** — `<module>/specs/<feature>.md` for a feature spec written before
  the code, `<module>/docs/<topic>.md` for explanation after it.

## Do-not-touch (global)

Each module's `CLAUDE.md` has its own list; these two apply everywhere.

- **`server/src/db/migrations/**`** — applied migrations are immutable. Never
  edit, renumber or delete an existing `.sql` file or `meta/_journal.json`;
  a schema change is always a NEW migration via `pnpm db:generate`. Editing
  one silently desyncs every database that already ran it.
- **Lock files** (`client/pnpm-lock.yaml`, `server/pnpm-lock.yaml`,
  `reviewer-core/package-lock.json`, `e2e/package-lock.json`) — never
  hand-edit and never delete to "fix" an install. Change them only as the
  by-product of a package-manager command, and use the right manager per
  package: **pnpm** in `client`/`server`, **npm** in `reviewer-core`/`e2e`.
