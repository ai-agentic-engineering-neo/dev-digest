# Insights — cross-module

Maintained via the `engineering-insights` skill (`.claude/skills/engineering-insights/SKILL.md`); entry format and rules live there.

## What Works
<!-- approaches and solutions that proved effective here -->

## What Doesn't Work
<!-- dead ends and antipatterns, each with why it failed; the most valuable section -->

## Codebase Patterns
<!-- unwritten conventions and architectural decisions, with the reason -->
- **Change the web port in `client/package.json` (`next dev -p` / `next start -p`), not in `client/.env`** — no client code reads `WEB_PORT`; `client/.env` keeps it only to mirror `server/.env`, where it sets the API's CORS origin. Keep all three equal. Evidence: `client/package.json:7`; `grep -rn WEB_PORT client` hits only `.env*` and CLAUDE.md. (2026-11-19)
- **After changing a default in `server/.env.example` or `client/.env.example`, update existing `.env` files by hand** — `dev.sh` copies the example only when `.env` is missing, and `.env` beats the code defaults, so a stale `DATABASE_URL=…:5432` kept pointing at another project's Postgres after the move to 55432. Evidence: `scripts/dev.sh:42`. (2026-11-19)

## Tool & Library Notes
<!-- dependency quirks, version-specific behaviour, CLI gotchas -->

## Recurring Errors & Fixes
<!-- exact error text → cause → fix -->
- **Install `server/` and `client/` with pnpm 10 (what CI pins), never pnpm ≥11** — pnpm 12 fails with `ERR_PNPM_IGNORED_BUILDS … Ignored build scripts: esbuild@0.21.5`, leaves `node_modules` with only `.pnpm/` and no links, drops a placeholder `pnpm-workspace.yaml` (`allowBuilds: esbuild: set this to true or false`) and rewrites `pnpm-lock.yaml` without the `pnpm.overrides` from `package.json` (postcss/katex security pins). Fix: `npm i -g pnpm@10`, `git checkout -- pnpm-lock.yaml`, delete the generated `pnpm-workspace.yaml` and `node_modules`, reinstall. `pnpm approve-builds` from the repo root reports nothing — there is no root package. Evidence: `.github/workflows/e2e-web.yml` (`pnpm/action-setup` `version: 10`); `git diff client/pnpm-lock.yaml` removed the `overrides:` block. (2026-11-20)
- **Run `docker compose up -d` (not `./scripts/dev.sh`) after changing the Postgres port in `docker-compose.yml`** — `dev.sh` reuses an existing `devdigest-postgres` in `created`/`exited` state via `docker start`, which keeps the old port binding, so it fails again with `Bind for 127.0.0.1:5432 failed: port is already allocated`; compose recreates the container (the `devdigest_pgdata` volume survives). Evidence: `scripts/dev.sh:56`; `docker inspect -f '{{json .HostConfig.PortBindings}}' devdigest-postgres`. (2026-11-19)

## Session Notes
<!-- one dated line per session that produced an entry above -->
- 2026-11-20 — split insights into root (cross-module) + per-module → moved pnpm, `.env`, Postgres-port and `WEB_PORT` entries here from `server/` and `client/`.
- 2026-11-20 — dev boot failed on pnpm 12 → pnpm-10-only rule.
- 2026-11-19 — moved dev ports to Postgres 55432 / API 13001 / web 13000 → stale-container recreate fix, `.env` not refreshed by `dev.sh`, `WEB_PORT` not read by Next.

## Open Questions
<!-- unverified hypotheses and unresolved items; move out once answered -->
