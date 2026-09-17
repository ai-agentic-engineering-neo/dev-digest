# dev-digest — DevDigest course starter

Local-first AI PR review. Course overview + architecture diagram: [README.md](./README.md).

## Repo shape
**Four standalone packages, no workspace** — each has its own `package.json` +
lockfile; cross-package code is shared via tsconfig path aliases, not published
modules or a monorepo tool.

| Folder | Package | Role | Port | Details |
|---|---|---|---|---|
| `server/` | `@devdigest/api` | Fastify + Drizzle/Postgres | 3001 | [server/CLAUDE.md](./server/CLAUDE.md) |
| `client/` | `@devdigest/web` | Next.js 15 studio | 3000 | [client/CLAUDE.md](./client/CLAUDE.md) |
| `reviewer-core/` | `@devdigest/reviewer-core` | Pure review engine | — | [reviewer-core/CLAUDE.md](./reviewer-core/CLAUDE.md) |
| `e2e/` | `@devdigest/e2e` | Browser e2e (agent-browser) | — | [e2e/CLAUDE.md](./e2e/CLAUDE.md) |

`repo-intel` (codebase indexer) lives inside `server/`:
[server/src/modules/repo-intel/CLAUDE.md](./server/src/modules/repo-intel/CLAUDE.md).
Reviewer agent prompt library:
[docs/agent-prompts/CLAUDE.md](./docs/agent-prompts/CLAUDE.md).

## Commands
`./scripts/dev.sh` — starts Postgres (Docker), installs deps, migrates + seeds,
launches API (:3001) + web (:3000). Flags: `--no-seed` `--no-client` `--db-only`.
Only Postgres runs in Docker; API and web run on the host.

## Non-default conventions
- **Node ≥22, pnpm ≥10** for `server/`/`client/`; `reviewer-core/`/`e2e/` use npm.
- **Migrations never run on boot** — `cd server && pnpm db:migrate` after every
  pull that touches the schema.
- Shared Zod contracts (`@devdigest/shared`) are **vendored separately** into both
  `server/src/vendor/shared` and `client/src/vendor/shared` (no symlink/workspace)
  — a change to one must be manually mirrored to the other.
- Each package has its own test suite + CI workflow, gated by path filters — see
  [TESTING.md](./TESTING.md) before adding cross-package logic.

## Do not touch
- `server/clones/**` — git-ignored runtime data (cloned repos under review).
- `.devdigest/cache/`, `clones/`, `test-results/`, `playwright-report/` — all
  git-ignored generated/runtime data, never commit into these.

## Links
[README](./README.md) · [TESTING.md](./TESTING.md) ·
[server](./server/CLAUDE.md) · [client](./client/CLAUDE.md) ·
[reviewer-core](./reviewer-core/CLAUDE.md) · [e2e](./e2e/CLAUDE.md) ·
[repo-intel](./server/src/modules/repo-intel/CLAUDE.md) ·
[agent-prompts](./docs/agent-prompts/CLAUDE.md)
