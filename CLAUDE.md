# DevDigest — local-first AI PR reviewer (course starter)
Import a GitHub repo → index it (repo-intel) → import PRs → run agent review →
grounded findings. Starter for a course: lessons L01–L08 add features back; unused
DB tables / prompt slots / contracts are intentional placeholders — don't delete.

## Stack
Node ≥22 · pnpm ≥10 (server, client) · npm (reviewer-core, e2e) · TypeScript 5.7 strict
server: Fastify 5 · Drizzle 0.38 · Postgres 16 + pgvector (Docker) · Zod 3
client: Next.js 15 App Router · React 19 · TanStack Query 5 · next-intl
LLM: OpenRouter (default for seeded agents) · OpenAI · Anthropic — via injected LLMProvider
Run everything: ./scripts/dev.sh  (Postgres + migrate + seed + API :3001 + web :3000; no root package.json)

## Map
server/          Fastify API, DB, repo-intel indexer, adapters      → server/CLAUDE.md
client/          Next.js studio UI                                  → client/CLAUDE.md
reviewer-core/   pure engine: diff → prompt → LLM → grounding       → reviewer-core/CLAUDE.md
e2e/             deterministic agent-browser flows                  → e2e/CLAUDE.md
docs/agent-prompts/  canonical reviewer system prompts
.github/workflows/   one path-filtered workflow per package
.claude/skills/      vendored skills (fastify, drizzle, next, zod, …)
Each package also has docs/ (notes), specs/ (feature specs), INSIGHTS.md (lessons learned).

## How packages connect (not a monorepo — no workspace)
- Shared code via tsconfig path aliases, NOT published packages.
- `@devdigest/shared` (Zod contracts) source of truth = server/src/vendor/shared.
  reviewer-core imports it from ../server; client keeps a COPY in client/src/vendor/shared.
- server imports reviewer-core as TS source (`../reviewer-core/src`); no build step.
- client ↔ server: REST on :3001 + SSE `/runs/:id/events` for live review logs.

## Global rules
- Before editing files in `<pkg>/`, read `<pkg>/CLAUDE.md` (subdir auto-load is unreliable in VS Code).
- Changing a contract in server/src/vendor/shared → mirror it in client/src/vendor/shared in the same change.
- Run commands inside the package dir with that package's manager (pnpm vs npm) — never mix lockfiles.
- DB change = edit server/src/db/schema/* then `cd server && pnpm db:generate`.
- Secrets never go to git/DB: they live in ~/.devdigest/secrets.json (0600) or .env.
- New cross-package alias → add it to the CI `paths:` filters in .github/workflows.

## Do not touch
- server/src/db/migrations/** (existing files + meta/_journal.json) — append only via drizzle-kit.
- `docker compose down -v` — deletes the devdigest_pgdata volume (all imported repos/reviews).
- server/clones/** — runtime data (git-ignored); git remotes there contain the GitHub token.
- server/package.json is `skip-worktree` locally — don't "fix" diffs against committed scripts.
- .claude/skills/** and skills-lock.json — vendored via the skills CLI, not hand-edited.

## Read when
- Architecture / end-to-end flow → README.md
- Writing or placing tests, CI lanes → TESTING.md
- Editing a reviewer prompt → docs/agent-prompts/README.md
- Something non-obvious cost you time → add an entry to `<pkg>/INSIGHTS.md` (format inside)
