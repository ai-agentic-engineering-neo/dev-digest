# `@devdigest/api` — the engine (Fastify + Postgres)

The DevDigest backend: imports repos and pull requests, indexes a repo with
`repo-intel`, stores agents, and runs the reviewer (diff → `reviewer-core` →
grounded structured findings). Fastify 5 + Drizzle ORM over Postgres (pgvector),
with every external dependency behind an adapter so tests can swap in mocks.

## Quick start

```sh
pnpm install
pnpm db:migrate    # required — migrations do NOT run on boot
pnpm db:seed       # optional, idempotent demo data
pnpm dev           # API on :3001
```

No keys are required to boot. Add them in `server/.env` or through the Settings
UI at runtime.

| Script | What |
|--------|------|
| `pnpm dev` | tsx watch on `:3001` |
| `pnpm build` · `pnpm typecheck` | compile · type-check |
| `pnpm db:migrate` · `pnpm db:seed` · `pnpm db:generate` | apply · seed · generate a migration |
| `pnpm test` | both suites (unit + integration) |

## Where to read next

| Topic | Document |
|-------|----------|
| Repo map, conventions, gotchas, do-not-touch zones | [CLAUDE.md](CLAUDE.md) |
| Non-obvious findings recorded while working here | [INSIGHTS.md](INSIGHTS.md) |
| Layers, request/DI flow, API map, review path, data model | [docs/architecture.md](docs/architecture.md) |
| Environment variables, secret storage, migrations | [docs/configuration.md](docs/configuration.md) |
| Route-by-route HTTP contract and error envelope | [specs/api-contract.md](specs/api-contract.md) |
| The codebase indexer | [src/modules/repo-intel/README.md](src/modules/repo-intel/README.md) |
| Test strategy and the unit/integration split | [../TESTING.md](../TESTING.md) |
