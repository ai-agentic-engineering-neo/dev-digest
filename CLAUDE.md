# CLAUDE.md — dev-digest

Local-first AI PR review. **Course starter**: 4 standalone packages, no
workspace tool (no pnpm workspaces / turborepo) — each has its own
`package.json` + lockfile. Cross-package types via tsconfig path aliases, not
published modules.

## Stack

Node ≥22 · pnpm ≥10 (`server/`, `client/`) · npm (`reviewer-core/`, `e2e/` —
see their own `CLAUDE.md`) · Docker (Postgres + pgvector only — API and web
run on the host, not in a container).

## Where things live

- `server/` — Fastify 5 + Drizzle/Postgres API (`:3001`) → [server/CLAUDE.md](server/CLAUDE.md)
- `client/` — Next.js 15 studio, App Router (`:3000`) → [client/CLAUDE.md](client/CLAUDE.md)
- `reviewer-core/` — pure review engine (diff → LLM → findings), no DB/FS → [reviewer-core/CLAUDE.md](reviewer-core/CLAUDE.md)
- `e2e/` — deterministic browser e2e (agent-browser, no LLM) → [e2e/CLAUDE.md](e2e/CLAUDE.md)
- `docs/` — cross-cutting reference docs (agent prompts, model choice) that don't belong to one package

## Commands

```sh
./scripts/dev.sh              # Postgres + API (seeded) + web, from zero
./scripts/dev.sh --no-seed    # skip demo data
./scripts/dev.sh --db-only    # migrations only, then exit
./scripts/e2e.sh              # hermetic e2e stack (own ports, own DB)
```

Per-package `dev` / `test` / `typecheck` — see that package's own `CLAUDE.md`
for the exact command (pnpm vs npm differs).

## Naming conventions

- DB columns: `snake_case`, declared explicitly in the Drizzle schema next to
  a `camelCase` TS field name (`costUsd: doublePrecision('cost_usd')`).
- `@devdigest/shared` contract/DTO fields (the wire format): `snake_case`
  (`cost_usd`, `created_at`, `start_line`, `findings_summary`) — matches the
  DB/JSON shape, not the surrounding TS convention.
- Everything else in TS/JS — variables, params, local identifiers:
  `camelCase`.
- Zod schema consts and their inferred types share one `PascalCase` name:
  `export const Severity = z.enum([...]); export type Severity = z.infer<typeof Severity>;`.
- Zod enum values: `UPPER_CASE` for severity-like states (`CRITICAL`,
  `WARNING`, `SUGGESTION`), `lower_snake_case` for everything else (`bug`,
  `secret_leak`, `request_changes`).
- React components: `PascalCase`, one component per file, colocated under
  `_components/<Name>/<Name>.tsx` (+ `<Name>.test.tsx` beside it) — see each
  package's own `CLAUDE.md` for that package's component layout.
- Route segments under `client/src/app/**`: lowercase folder names, dynamic
  segments in `[brackets]` (`repos/[repoId]/pulls/[number]`).
- Migration files (`server/src/db/migrations/*.sql`): auto-named by
  `drizzle-kit generate` (`NNNN_adjective_noun.sql`) — never hand-name or
  rename one.

## Non-default conventions

- `@devdigest/shared` (Zod contracts) is **not a package** — it's hand-copied
  into `server/src/vendor/shared` **and** `client/src/vendor/shared`. Both
  copies must be edited together when a shared contract changes; nothing
  enforces this automatically.
- Migrations do **not** run on boot — `pnpm db:migrate` is always manual.
- Secrets (LLM keys, `GITHUB_TOKEN`) live in `~/.devdigest/secrets.json`
  (mode `0600`), not `.env`, not the database.
- The DB schema already ships every table later course lessons need — the
  unused ones just sit empty until that lesson fills them in.

## Do-not-touch

- `server/clones/` — git-ignored working checkouts of indexed repos.
- `docker compose down -v` — deletes the `devdigest_pgdata` volume, i.e.
  every imported repo and review. Use `docker compose down` (no `-v`) to stop
  Postgres without losing data.
- Lock files (`pnpm-lock.yaml` in `server/`/`client/`, `package-lock.json` in
  `reviewer-core/`/`e2e/`) — never hand-edit; let the package manager
  regenerate them (`pnpm install` / `npm install`) when `package.json` changes.

## Read When

- **Onboarding / first run** → [README.md](README.md) (quick start, architecture diagram)
- **Cross-package test strategy** → [TESTING.md](TESTING.md)
- **Working inside a package** → that package's own `CLAUDE.md` (it links to its `README.md` / `docs/` / `specs/` / `INSIGHTS.md`)
- **Hit something surprising in a package** → check that package's `INSIGHTS.md` before re-deriving it

## Docs map

- [README.md](README.md) — quick start, full architecture diagram, course lesson map
- [TESTING.md](TESTING.md) — test strategy across all 5 CI workflows
- [docs/](docs/) — cross-cutting reference docs (agent prompt library, model choice)
