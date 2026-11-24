# DevDigest — local AI review of pull requests (starter; M1–M8 roadmap in README.md)

## Stack
Node ≥22 · pnpm ≥10 · TypeScript 5.x · Zod 3.25 (not v4) · vitest 2 · Postgres 16 + pgvector (Docker) · GitHub Actions (5 workflows, path-filtered)

## Map
- client/        — Next.js 15 UI :3000              → client/CLAUDE.md
- server/        — Fastify 5 API :3001 + DB + jobs  → server/CLAUDE.md
- reviewer-core/ — pure review engine (no DB/FS)    → reviewer-core/CLAUDE.md
- e2e/           — deterministic browser flows      → e2e/CLAUDE.md
- docs/          — cross-cutting docs (onboarding, agent prompts)
- scripts/       — dev.sh (whole stack), e2e.sh (hermetic e2e)
- INSIGHTS.md    — cross-package lessons; each package has its own INSIGHTS.md (skill engineering-insights)
- .claude/       — skills (vendored + engineering-insights), settings.json with the insights hooks

Working in a subproject → read its CLAUDE.md first (auto-loading is unreliable in the VS Code extension).

## Commands
- Whole stack from scratch: `./scripts/dev.sh` (`--no-client`, `--db-only`, `--no-seed`)
- Tests/typecheck — from the package folder, see its CLAUDE.md

## Cross-package conventions
- All documentation is written in English: CLAUDE.md, README, docs/, specs, INSIGHTS entries, code comments. When you edit an existing non-English doc, write your additions in English.
- There is NO monorepo workspace: each package has its own package.json and lockfile.
  pnpm — client/, server/; npm — reviewer-core/, e2e/. Don't mix them.
- Code is shared between packages via tsconfig path aliases; server imports the sources of ../reviewer-core/src
- Zod contracts are copied twice: server/src/vendor/shared (source of truth) and client/src/vendor/shared; they must stay byte-identical —
  `scripts/check-contracts.sh` enforces it in CI (client workflow).
  Changing a contract → update both copies. reviewer-core reads the copy in server/.
- A change in reviewer-core/** triggers CI server-unit — also check the server typecheck
- .claude/skills/* — vendored skills for the assistant, not product code; the exceptions are our own engineering-insights (its hooks are in .claude/settings.json), onion-architecture (backend layering rules for server/ + reviewer-core) and frontend-ui-architecture (code organization rules for client/)

## Do not touch
- `docker compose down -v` — destroys the devdigest_pgdata volume with all imported repos
- ~/.devdigest/secrets.json — secrets never go into the DB, git or logs

## Read when
- Before changing architecture or a cross-package flow → read README.md ("Architecture")
- Before your first task in this repo → read docs/ONBOARDING.md
- Before adding or changing an API route → read server/README.md ("API map")
- Before writing or running tests, or touching CI → read TESTING.md
- Before editing a reviewer agent prompt → read docs/agent-prompts/README.md
- Before editing a package → read its INSIGHTS.md (the hook injects it automatically); found something non-obvious → skill engineering-insights, writing only via insights.mjs append
