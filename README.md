# DevDigest — apps

Three standalone projects (no monorepo workspace — each has its own
`package.json` / `pnpm-lock.yaml`):

| Folder    | Package           | What it is                                   | Port |
|-----------|-------------------|----------------------------------------------|------|
| `server/` | `@devdigest/api`  | Fastify API + Drizzle/Postgres (pgvector)    | 3001 |
| `client/` | `@devdigest/web`  | Next.js 15 web app                           | 3000 |
| `mcp/`    | `@devdigest/mcp`  | MCP server (stdio) + pre-push review CLI     | —    |

Only **Postgres** runs in Docker; the API and web app run on the host via `pnpm dev`.

## Prerequisites

- **Node** ≥ 22 · **pnpm** ≥ 10 (`npm i -g pnpm`) · **Docker** (for Postgres)

## Quick start (from zero)

```sh
./scripts/dev.sh
```

This script:
1. starts Postgres (`docker compose up -d`) and waits until it's healthy,
2. creates `server/.env` and `client/.env` from `.env.example` if missing,
3. installs deps in `server/` and `client/` (only when `node_modules` is absent),
4. applies DB migrations and seeds demo data,
5. launches the API (`:3001`) and the web app (`:3000`).

Open **http://localhost:3000**. Press **Ctrl-C** to stop the dev servers —
Postgres keeps running (`docker compose down` to stop it).

Flags: `--no-seed` · `--no-client` · `--db-only` · `--help`.

> Add your keys in `server/.env` (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
> `GITHUB_PAT`). They can also be entered via the Settings UI at runtime.

## Manual steps (what the script does)

```sh
docker compose up -d                                   # Postgres + pgvector

cd server && pnpm install
pnpm db:migrate          # apply migrations (NOT run automatically on boot)
pnpm db:seed             # idempotent demo data (optional)
pnpm dev                 # API on :3001

cd ../client && pnpm install && pnpm dev               # web on :3000
```

MCP server / CLI (optional):

```sh
cd mcp && pnpm install
pnpm dev:server          # MCP server over stdio
pnpm dev:cli -- review --mode working   # pre-push review CLI
```

## Useful scripts

`server/`: `dev` · `build` · `db:migrate` · `db:seed` · `db:generate` · `test` · `typecheck`
`client/`: `dev` · `build` · `start` · `test` · `typecheck`

## Troubleshooting

- **`relation ... does not exist` / API errors on first run** — migrations weren't
  applied. The server does **not** migrate on boot: run `cd server && pnpm db:migrate`.
- **Port 5432 already in use** — another Postgres is running. Stop it, or change the
  host port in `docker-compose.yml`.
- **`vector` type errors** — the pgvector extension is enabled by migration `0000`;
  make sure migrations ran against the Dockerized DB, not a different one.
- **Reset everything** — `docker compose down -v` drops the volume, then re-run
  `./scripts/dev.sh`.
