# DevDigest

Local-first AI pull-request review. This is the **course starter template**: each
lesson (L01–L08) adds one feature back — see [README.md](README.md#what-you-build-in-the-course).

- Overview & quick start: [README.md](README.md)
- How the packages talk to each other: [docs/architecture.md](docs/architecture.md)
- Testing & CI strategy: [TESTING.md](TESTING.md)

## Packages

Standalone packages — **not** a pnpm workspace. Each has its own `package.json` and
lockfile; cross-package code is shared via tsconfig path aliases only.

| Package | Role | Instructions |
|---|---|---|
| `client/` | Next.js 15 studio, `:3000` | [client/CLAUDE.md](client/CLAUDE.md) |
| `server/` | Fastify + Drizzle API, `:3001`; hosts `repo-intel` | [server/CLAUDE.md](server/CLAUDE.md) |
| `reviewer-core/` | Pure review engine (no I/O) | [reviewer-core/CLAUDE.md](reviewer-core/CLAUDE.md) |
| `e2e/` | Deterministic browser flows (agent-browser) | [e2e/CLAUDE.md](e2e/CLAUDE.md) |

## Commands

- `./scripts/dev.sh` — Postgres (Docker) + migrate + seed + API + web. Flags: `--no-seed`, `--no-client`, `--db-only`.
- Tests / typecheck run per package — see each package's `CLAUDE.md`.
- Never `docker compose down -v` — it deletes the `devdigest_pgdata` volume.

## Cross-cutting rules

- Contracts are Zod schemas in `@devdigest/shared`. Source of truth:
  `server/src/vendor/shared`. `client/src/vendor/shared` is a **copy** — change both.
- `reviewer-core` must stay free of DB / GitHub / filesystem access.
- Before implementing a feature, look for its spec: cross-package specs in
  [specs/](specs/), package-specific ones in `<package>/specs/`.
- **Insights loop (`engineering-insights` skill) — mandatory:**
  - Start: after the user's first prompt and before any other work, read the `INSIGHTS.md`
    of every module the request concerns; treat it as high-confidence guidance.
  - End: re-read that `INSIGHTS.md`, then append only substantial lessons not already there.
    Nothing new → write nothing. CLAUDE.md stays the stable handbook; lessons go to `INSIGHTS.md`.

## Documentation map

| Where | What |
|---|---|
| [docs/](docs/) | Architecture, [agent prompts](docs/agent-prompts/README.md), choosing a model |
| [specs/](specs/README.md) | Specs that span multiple packages |
| `<package>/README.md` | Human-facing package docs |
| `<package>/docs/` | Deeper package docs |
| `<package>/specs/` | Package-level feature specs (`e2e/test-plans/` for e2e) |
| `<package>/INSIGHTS.md` | Module lessons in 7 fixed sections, auto-loaded by that package's CLAUDE.md (also `server/src/modules/repo-intel/`) |

## Do-not-touch
'server/src/vendor/shared/"
and
'server/src/db/migrations/'
never hand-edit without coordination.

## Use when
Stack, commands, architecture, how to run → read
- Working inside a package → read that package's
' reviewer-core/CLAUDE.md, "e2e/CLAUDE.md" I
- Agent prompt templates → read 'docs/agent-prompts/"

## Insights

@INSIGHTS.md
