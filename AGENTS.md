# DevDigest — AGENTS.md

Local-first AI PR review: import a GitHub PR → LLM agent review → findings grounded in the diff.

## Packages
No workspace, no root package.json — each package has its own deps, lockfile and `AGENTS.md` (`CLAUDE.md` is a symlink to it — edit `AGENTS.md`; a new package gets both).

| Dir | What | Pkg manager |
|---|---|---|
| `server/` | Fastify 5 API :3001, Drizzle + Postgres 16 (pgvector) | pnpm |
| `client/` | Next.js 15 / React 19 web app :3000 | pnpm |
| `reviewer-core/` | pure review engine, consumed as raw TS source | npm |
| `e2e/` | deterministic browser flows (agent-browser) | npm |

Cross-package code is shared via tsconfig `paths` aliases to raw source (mirrored in `vitest.config.ts`), never installed as a dependency:
- `@devdigest/shared` (Zod contracts): canonical copy `server/src/vendor/shared`; `client/src/vendor/shared` is a vendored subset.
- `@devdigest/reviewer-core` → `reviewer-core/src` (used by server).

## Run
Node ≥ 22, pnpm ≥ 10, Docker (only Postgres runs in Docker).
```sh
./scripts/dev.sh   # Postgres → missing deps → migrate → seed → API + web  (--no-seed | --no-client | --db-only)
./scripts/e2e.sh   # hermetic e2e on alternate ports with a throwaway DB
```
Build/test commands per package: see that package's `AGENTS.md`.
CI: `.github/workflows/`, one path-filtered workflow per suite.

## Rules for every package
- Lockfiles: never hand-edit; use the owning package manager (pnpm: server, client; npm: reviewer-core, e2e).
- Never edit `.env` files or `~/.devdigest/secrets.json`; new config goes into `.env.example`.
- Import across packages only via the aliases above, never by `../` relative path.
- Changing `server/src/vendor/shared` → typecheck server AND reviewer-core, then mirror what the client uses into `client/src/vendor/shared` (it already lags behind; don't assume they match).

## Gotchas
- The server needs reviewer-core's deps: `cd reviewer-core && npm ci`, otherwise `ERR_MODULE_NOT_FOUND` at boot / TS2307 in typecheck.
- `docker compose down -v` deletes the `devdigest_pgdata` volume with every imported repo and review. Never run it without asking.
- Use the root `docker-compose.yml` (loopback only); `server/docker-compose.yml` binds all interfaces.

## Read when
- Read `README.md` when you need the end-to-end architecture or review flow.
- Read `TESTING.md` before adding a test suite or changing CI.
- Read `docs/agent-prompts/README.md` before writing or changing a reviewer agent prompt.
- Read `specs/` before implementing a feature that spans several packages; write the spec first if missing.

## Insights protocol (mandatory, every task)
- Start: after the user's request and before reading code or answering, read the `INSIGHTS.md` of the package the request is about, plus its `INSIGHTS-<domain>.md` for the area you touch (root `INSIGHTS.md` too if it spans packages). Re-read when work moves to another package. Treat relevant entries as high-confidence guidance unless the user says otherwise; if the code contradicts an entry, the code wins — add a `contradicted` comment.
- End: before the final answer, use the `engineering-insights` skill — re-read the target `INSIGHTS.md` and append only substantial, verified findings not already recorded. Nothing new → write nothing. Do not skip this step.
