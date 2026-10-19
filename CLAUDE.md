# DevDigest

Local-first AI pull-request review. Course starter: each lesson (L01–L08) adds
one feature as a new self-contained module — keep changes inside that module.

## Stack
- Node ≥22 · pnpm ≥10 · TypeScript 5.7 strict (`noUncheckedIndexedAccess`) · ESM
- server: Fastify 5 · Drizzle 0.38 · Postgres + pgvector · zod 3
- client: Next.js 15 (App Router) · React 19 · TanStack Query 5 · Tailwind 4
- reviewer-core: pure TS + zod, LLM via injected provider
- tests: vitest 2 · testcontainers · agent-browser (e2e, no LLM)

## Commands
- Full stack: `./scripts/dev.sh` (Postgres → migrate → seed → API :3001 + web :3000)
- server unit: `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'`
- server integration (needs Docker): `cd server && pnpm exec vitest run .it.test`
- client: `cd client && pnpm typecheck && pnpm test`
- reviewer-core: `cd reviewer-core && npm run typecheck && npm test` (npm, not pnpm)
- e2e: `cd e2e && npm run e2e:hermetic` (npm, not pnpm)

## Map
- `server/`        API, DB, adapters, repo-intel indexer      → server/CLAUDE.md
- `client/`        Next.js studio UI                          → client/CLAUDE.md
- `reviewer-core/` pure review engine (prompt → LLM → grounding) → reviewer-core/CLAUDE.md
- `e2e/`           deterministic browser flows                → e2e/CLAUDE.md
- `docs/agent-prompts/` system prompts of the built-in agents
- Root `docs/` · `specs/` · `INSIGHTS.md` — only for things that span packages.

Every module has: `README.md` (source of truth) · `CLAUDE.md` (this kind of map)
· `INSIGHTS.md` (lessons log) · `docs/` (deep dives) · `specs/` (feature specs).

## Cross-package rules (non-default)
- NO monorepo workspace. Packages share code only via tsconfig `paths`
  (source imports, no build). Do not add workspace deps or publish packages.
- Zod contracts exist TWICE: `server/src/vendor/shared` and
  `client/src/vendor/shared`. A contract change must be applied to both.
- Secrets go through `SecretsProvider` (`~/.devdigest/secrets.json`) only —
  never DB, git, or a committed `.env`.
- Migrations are NOT applied on boot; run `pnpm db:migrate` in `server/`.
- Code comments mentioning an "agent-runner (CI)" refer to a package that does
  not exist yet (future lesson) — don't look for it.

## Do not touch
- `INJECTION_GUARD` and the grounding gate in reviewer-core — never weaken them,
  never replace them with keyword filtering.
- `server/src/db/migrations/**` — generated; edit the schema, then `pnpm db:generate`.
- Empty "future lesson" tables, contracts and `client/src/vendor/ui` widgets —
  intentional, do not delete as dead code.

## Read when
- Before changing anything that crosses packages → read README.md §Architecture.
- Before writing, moving or splitting a test → read TESTING.md.
- Before editing a built-in agent's prompt → read docs/agent-prompts/README.md.
- Before implementing a feature → read its spec in `<module>/specs/` (or root
  `specs/` if it spans packages).
- Before editing files in a module → read `<module>/CLAUDE.md` and
  `<module>/INSIGHTS.md` explicitly (subdirectory auto-load is unreliable in
  the VS Code extension).

## Insights
- Read: before working in a module, read its `INSIGHTS.md` and treat entries
  as high-confidence guidance.
- Capture: found a non-obvious lesson, or finished a task that produced one?
  Use the `engineering-insights` skill (append-only, module's `INSIGHTS.md`).
- Ask before promoting an insight into a CLAUDE.md.
