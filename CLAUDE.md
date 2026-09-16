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

## Read When

- **Onboarding / first run** → [README.md](README.md) (quick start, architecture diagram)
- **Cross-package test strategy** → [TESTING.md](TESTING.md)
- **Working inside a package** → that package's own `CLAUDE.md` (it links to its `README.md` / `docs/` / `specs/` / `INSIGHTS.md`)
- **Hit something surprising in a package** → check that package's `INSIGHTS.md` before re-deriving it

## Docs map

- [README.md](README.md) — quick start, full architecture diagram, course lesson map
- [TESTING.md](TESTING.md) — test strategy across all 5 CI workflows
- [docs/](docs/) — cross-cutting reference docs (agent prompt library, model choice)
