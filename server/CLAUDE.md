# server — @devdigest/api (Fastify + Postgres)

The engine: imports repos/PRs, indexes with `repo-intel`, stores agents, runs
the reviewer (diff → `reviewer-core` → grounded findings). Request/DI flow,
full API map, mermaid diagrams → [README.md](README.md).

## Stack

Fastify 5, Drizzle ORM, `postgres`, pgvector. Zod contracts from
`src/vendor/shared` (`@devdigest/shared`) double as route schemas via
`fastify-type-provider-zod` — one definition drives validation **and**
serialization.

## Commands

`pnpm dev` (:3001) · `pnpm db:migrate` · `pnpm db:seed` (idempotent demo data)
· `pnpm typecheck` · `pnpm test` (unit + integration, see Testing below)

## Map

- `src/modules/<name>/` — one feature module per domain (`repos`, `pulls`, `reviews`, `agents`, `polling`, `repo-intel`, `settings`, `workspace`); each owns `routes.ts`, registered statically in `src/modules/index.ts`
- `src/platform/` — DI container, config (`config.ts` marks every secret optional)
- `src/adapters/` — ports for LLM/GitHub/git/ast-grep/secrets/tokenizer, swapped for mocks (`src/adapters/mocks.ts`) in tests
- `src/db/` — Drizzle schema + migrations
- `src/prompts/` — system prompts fed into `reviewer-core`

## References

- [docs/](docs/) — deeper notes that don't fit the README
- [specs/](specs/) — feature specs for this module
- [insights.md](insights.md) — gotchas discovered while working here; check before deep-diving. New findings get appended here by the `engineering-insights` skill

## Gotchas (non-obvious, see README for detail)

- **No keys required to boot.** Secrets live in `~/.devdigest/secrets.json` (mode `0600`, via Settings UI), `process.env` as fallback — never in git/DB. `GITHUB_TOKEN` is canonical, `GITHUB_PAT` a fallback.
- **Migrations don't run on boot** — always `pnpm db:migrate` after pulling schema changes.
- `server/clones/` (`DEVDIGEST_CLONE_DIR`) — runtime repo checkouts, git-ignored, never edit by hand.
- **Repo Intel is ON by default** (`REPO_INTEL_ENABLED`); an unindexed repo silently degrades to diff-only context — don't assume the repo map is always present.
- **Prompt-injection defense is one shared `INJECTION_GUARD` rule, not keyword scanning** — see `reviewer-core/prompt.ts`. Don't add denylist-style text filtering here.
- **Grounding is mandatory**: findings without a real diff-line citation are dropped and the score is recomputed — never trust the model's self-reported score.
- Tests split by filename: `*.it.test.ts` = DB-backed (testcontainers, self-skips without Docker), everything else must stay hermetic. Keep this suffix convention when adding DB-backed tests.
