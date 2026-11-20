# Insights — server

Maintained via the `engineering-insights` skill (`.claude/skills/engineering-insights/SKILL.md`); entry format and rules live there.

## What Works
<!-- approaches and solutions that proved effective here -->

## What Doesn't Work
<!-- dead ends and antipatterns, each with why it failed; the most valuable section -->

## Codebase Patterns
<!-- unwritten conventions and architectural decisions, with the reason -->
- **After changing a default in `server/.env.example` or `client/.env.example`, update existing `.env` files by hand** — `dev.sh` copies the example only when `.env` is missing, and `.env` beats the code defaults, so a stale `DATABASE_URL=…:5432` kept pointing at another project's Postgres after the move to 55432. Evidence: `scripts/dev.sh:42`. (2026-11-19)

## Tool & Library Notes
<!-- dependency quirks, version-specific behaviour, CLI gotchas -->

## Recurring Errors & Fixes
<!-- exact error text → cause → fix -->
- **Run `docker compose up -d` (not `./scripts/dev.sh`) after changing the Postgres port in `docker-compose.yml`** — `dev.sh` reuses an existing `devdigest-postgres` in `created`/`exited` state via `docker start`, which keeps the old port binding, so it fails again with `Bind for 127.0.0.1:5432 failed: port is already allocated`; compose recreates the container (the `devdigest_pgdata` volume survives). Evidence: `scripts/dev.sh:56`; `docker inspect -f '{{json .HostConfig.PortBindings}}' devdigest-postgres`. (2026-11-19)

## Session Notes
<!-- one dated line per session that produced an entry above -->
- 2026-11-19 — moved dev ports to Postgres 55432 / API 13001 / web 13000 → stale-container recreate fix, `.env` not refreshed by `dev.sh`.

## Open Questions
<!-- unverified hypotheses and unresolved items; move out once answered -->
