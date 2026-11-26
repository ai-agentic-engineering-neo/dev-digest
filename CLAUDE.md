# DevDigest

Local-first AI pull-request review. This is a starter: features come back one
milestone at a time (M1–M8, see README.md → Roadmap).

## Stack
- Node 22 · pnpm 10 (NOT 11+: install fails with ERR_PNPM_IGNORED_BUILDS) · Docker (Postgres + pgvector only)
- 4 independent packages, NO workspace — run every command inside the package dir.

## Map — before editing a module, read its CLAUDE.md
| Path | What | PM | Read first |
|---|---|---|---|
| server/ | Fastify API :3001, DB, repo-intel | pnpm | server/CLAUDE.md |
| client/ | Next.js studio :3000 | pnpm | client/CLAUDE.md |
| reviewer-core/ | pure review engine (diff → LLM → grounded findings) | npm | reviewer-core/CLAUDE.md |
| e2e/ | deterministic browser e2e (agent-browser) | npm | e2e/CLAUDE.md |

Subdirectory CLAUDE.md files may not auto-load in the VS Code extension — open the module's file explicitly.

## Docs in every module
- `README.md` — human overview + diagrams
- `docs/` — deep reference (architecture, flows, data model)
- `specs/` — feature specs; read the matching spec before implementing a feature
- `INSIGHTS.md` — gotchas learned the hard way; read before non-trivial changes, append when you hit a new one

Repo-wide: `TESTING.md` (test strategy) · `docs/agent-prompts/` (reviewer prompts) · `.claude/skills/README.md` (skills catalog)

## Commands
- Whole stack: `./scripts/dev.sh` (`--no-seed` `--no-client` `--db-only`)
- Done = `typecheck` + `test` pass in every package you touched.

## Cross-cutting rules
- `@devdigest/shared` exists TWICE: `server/src/vendor/shared` (also used by reviewer-core)
  and `client/src/vendor/shared`. They already differ — a contract change must update both copies.
- Secrets never go to git or the DB — only through `LocalSecretsProvider` (`~/.devdigest/secrets.json`).
- Any author-controlled text sent to an LLM goes through `wrapUntrusted()`.

## Do not touch
- `server/src/db/migrations/*` — generated: edit `db/schema/`, then `pnpm db:generate`
- Lockfiles by hand · `server/clones/` · `.claude/skills/*` (vendored, pinned in `skills-lock.json`)
- Never `docker compose down -v` — it deletes the dev DB volume with all imported repos.
