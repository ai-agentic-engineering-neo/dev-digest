# Insights — repo root (cross-package, scripts, infra)

Verified, non-obvious lessons for agents and humans. Maintained by the `engineering-insights` skill.
Entry: `` - YYYY-MM-DD · trigger · rule — why · `evidence` `` (path + symbol, no line numbers; max 2 lines). Append-only, newest at the bottom of each section.
To correct an entry, append a new one with `(supersedes YYYY-MM-DD)` and prefix the old one with `[SUPERSEDED]`.

## What Works
<!-- Approaches that solved a problem where the default way fails or is worse. -->

## What Doesn't Work
<!-- Dead ends and antipatterns. Always state the alternative. The most valuable section. -->

## Codebase Patterns
<!-- Conventions and architectural decisions with their reason, not documented elsewhere. -->

## Tool & Library Notes
<!-- Quirks of our pinned dependencies, CLIs, and setup. -->

## Recurring Errors & Fixes
<!-- Start with the exact error text in backticks, then the cause and the fix. -->
- [SUPERSEDED] 2026-11-22 · `password authentication failed for user "devdigest"` (28P01) from dev.sh migrate on macOS · a native Postgres (e.g. /Library/PostgreSQL/17, LaunchDaemon postgresL-17) on *:5432 shadows the container — find it with netstat (lsof w/o sudo shows nothing), stop it via launchctl bootout · `netstat -anv -p tcp | grep "\.5432 .*LISTEN"`
- 2026-11-22 · `password authentication failed for user "devdigest"` (28P01) from dev.sh migrate on macOS · a native Postgres (e.g. /Library/PostgreSQL/17, LaunchDaemon postgresql-17) on *:5432 shadows the container — find it with netstat (lsof w/o sudo shows nothing), stop it via launchctl bootout (supersedes 2026-11-22) · `netstat -anv -p tcp | grep "\.5432 .*LISTEN"`
- 2026-11-22 · `ECONNREFUSED 127.0.0.1:5432` right after stopping a conflicting host Postgres · Docker Desktop silently failed to bind the port while it was taken, yet `docker ps` still shows 127.0.0.1:5432->5432 — run `docker compose restart postgres` to re-bind · `docker-compose.yml` postgres.ports

## Session Notes
<!-- One dated line per substantial session: goal · outcome · open end. Keep the last 10. -->
- 2026-11-22 · dev.sh migrate failed (28P01, then ECONNREFUSED) · root cause: native Postgres 17 on :5432; stopped it + restarted container; migrations apply · none

## Open Questions
<!-- Unverified hypotheses and unexplained behaviour. Move them out once confirmed. -->
