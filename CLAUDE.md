# DevDigest

Local-first AI pull-request review — a course starter template. Full picture:
[`README.md`](README.md). Test strategy: [`TESTING.md`](TESTING.md).

## Before answering

Always search the relevant package's `docs/`, `specs/`, and `INSIGHTS.md` for
what the user asks about FIRST — these are curated and may already answer it
— then read code.

## Before ending a session

If you learned something non-obvious (a gotcha, a dead end, a decision with
rationale), write it to the relevant package's `INSIGHTS.md` — see the
`engineering-insights` skill. Invoke it directly (`/engineering-insights`)
if it doesn't trigger on its own.

## Quick start

```
./scripts/dev.sh                 # Postgres (Docker) → env files → deps →
                                  # migrate → seed → API :3001 + web :3000
./scripts/dev.sh --no-seed
./scripts/dev.sh --no-client
./scripts/dev.sh --db-only
```

Manual equivalent:

```
docker compose up -d
cd server && pnpm install && pnpm db:migrate && pnpm db:seed && pnpm dev
cd client && pnpm install && pnpm dev
```

Prereqs: Node ≥22 · pnpm ≥10 · Docker. Migrations do **not** run on boot.
Keys (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GITHUB_TOKEN`) are optional to
boot — set via `server/.env` or the Settings UI at runtime.

## Map

- [`server/`](server/CLAUDE.md) — Fastify API + Drizzle/Postgres, `:3001`
- [`client/`](client/CLAUDE.md) — Next.js studio UI, `:3000`
- [`reviewer-core/`](reviewer-core/CLAUDE.md) — pure review engine (diff →
  prompt → LLM → grounded findings)
- [`e2e/`](e2e/CLAUDE.md) — deterministic browser e2e (agent-browser)
- `server/src/vendor/shared` — `@devdigest/shared`, the Zod contracts every
  package consumes
- `server/src/modules/repo-intel` — the codebase indexer (lives inside
  `server`, not its own package)
- `docs/agent-prompts/` — built-in reviewer agent prompt docs, mirrored in
  `server/src/db/seed-prompts.ts`
- `scripts/` — `dev.sh` (boot everything), `e2e.sh` (hermetic e2e stack)
- `docker-compose.yml` — the one Dockerized service (Postgres + pgvector)
- `TESTING.md` — full test/CI strategy across all four packages

## Conventions (not obvious from code)

- NOT a monorepo workspace — each package has its own package.json/lockfile;
  cross-package code is shared via tsconfig path aliases.
- Modules are registered statically in `server/src/modules/index.ts` (no
  filesystem autoload).
- ESM: relative imports carry the `.js` extension.

## Do not touch

- The `devdigest_pgdata` Docker volume — never `docker compose down -v`, it
  wipes every imported repo/review. Use `./scripts/e2e.sh` for a disposable
  stack instead.
- `server/clones/**` — git-ignored runtime clone data.
