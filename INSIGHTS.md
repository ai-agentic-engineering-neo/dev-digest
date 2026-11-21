# Insights (cross-module)

Lessons that cost time. One entry per lesson, newest first: what happened → what to do.
Module-specific lessons go in `<module>/INSIGHTS.md`. Promote the ones that bite
repeatedly to "Gotchas" in the relevant CLAUDE.md.

- **Duplicated Zod contracts drift.** `server/src/vendor/shared` and `client/src/vendor/shared`
  differ in `adapters.ts`, `contracts/eval-ci.ts`, `knowledge.ts`, `productionize.ts`, `trace.ts`.
  → Update both copies on any contract change; consider a sync check in CI.
- **`docker compose down -v` wipes the dev DB.** The `devdigest_pgdata` volume holds every
  imported repo and review. → Use `docker compose down` (no `-v`).
