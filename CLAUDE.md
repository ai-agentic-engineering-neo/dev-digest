# DevDigest

Local-first AI PR-review tool. Four standalone packages (no workspace root; each has its own package.json and lockfile); cross-package sharing is via tsconfig path aliases.

| Module | Role | Guide |
|---|---|---|
| server | Fastify API, DB, indexer (port 3001) | [server/CLAUDE.md](server/CLAUDE.md) |
| client | Next.js UI (port 3000) | [client/CLAUDE.md](client/CLAUDE.md) |
| reviewer-core | Pure review engine | [reviewer-core/CLAUDE.md](reviewer-core/CLAUDE.md) |
| e2e | Browser tests | [e2e/CLAUDE.md](e2e/CLAUDE.md) |

## Stack
Node >= 22, pnpm >= 10, Docker (Postgres), TypeScript 5 `strict`, Vitest 2. Per-package stack, verify and naming: see each module's CLAUDE.md.

## Top-level map
- `scripts/`: `dev.sh` (local bootstrap), `e2e.sh`, `check-claude-md.mjs`
- `docs/`: agent prompts and plans
- `.claude/skills/`: project skills
- `docker-compose.yml`: Postgres (pgvector)
- `skills-lock.json`: pinned skill sources and hashes

## Run
- `./scripts/dev.sh` (flags and details in the [README](README.md)).
- Manual: `docker compose up -d`; `cd server && pnpm install && pnpm db:migrate && pnpm db:seed && pnpm dev`; `cd client && pnpm install && pnpm dev`.

## Verify
Run the module's own commands (see its CLAUDE.md), then `node scripts/check-claude-md.mjs`. No linter or formatter is configured; do not add or invent a lint command.

## Do not touch
- Migrations: `server/src/db/migrations/` is generated; see [server/CLAUDE.md](server/CLAUDE.md).
- Lock-files: `server/pnpm-lock.yaml`, `client/pnpm-lock.yaml`, `reviewer-core/package-lock.json`, `e2e/package-lock.json`, `skills-lock.json`. Never hand-edit, never delete and regenerate; change only via the package's own manager (pnpm in server and client, npm in reviewer-core and e2e); never mix managers.

## Read when
- Read `<module>/CLAUDE.md` before editing that module.
- Read `<module>/INSIGHTS.md` before changing an area it lists (gotchas).
- Read [README](README.md) when setting up or when you need the architecture diagram.
- Read [TESTING](TESTING.md) when adding tests, touching CI or running the checker.
- Read [agent prompts](docs/agent-prompts/README.md) when editing reviewer prompts.
- Read [skills](.claude/skills/README.md) when adding or changing a skill.
