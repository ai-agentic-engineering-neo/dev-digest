# server — @devdigest/api

Fastify 5 + Drizzle/Postgres (pgvector). Overview & diagrams: [README.md](README.md).

@INSIGHTS.md

## Commands (pnpm)
- `pnpm dev` (:3001) · `pnpm typecheck`
- unit: `pnpm exec vitest run --exclude '**/*.it.test.ts'` (no Docker)
- integration: `../scripts/hermetic.sh pnpm exec vitest run .it.test` (Docker; hermetic = no real provider keys, see INSIGHTS 2026-09-24)
- everything CI runs, recorded per tree: `../scripts/check-all.sh` (from the repo root: `scripts/check-all.sh`)
- `pnpm db:migrate` applies existing migrations (NOT applied on boot)

## Must not break
- Migrations and `pnpm-lock.yaml` are off-limits — see root [../AGENTS.md](../AGENTS.md).
- DB-backed tests (import `test/helpers/pg.ts`) MUST end in `.it.test.ts`.
- `package.json` is skip-worktree — don't add scripts CI relies on.
- New module = `src/modules/<name>/` + register in `src/modules/index.ts`.
- External calls go through adapters/DI; tests use `src/adapters/mocks.ts`.
- Secrets never in DB or git — only via `LocalSecretsProvider`.

## Read when
- Touching indexing / repo map → [src/modules/repo-intel/README.md](src/modules/repo-intel/README.md)
- Changing the review prompt → [../docs/agent-prompts/README.md](../docs/agent-prompts/README.md)
- Writing tests → [../TESTING.md](../TESTING.md)
- Implementing a feature → [specs/](specs/) · deeper design → [docs/](docs/)
