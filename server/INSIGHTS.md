# server — INSIGHTS

Append-only log of non-obvious things learned. One dated bullet each, newest last.
Format: `YYYY-MM-DD — what surprised us — why / what to do`.

- 2026-11-19 — `src/vendor/shared` differs from `client/src/vendor/shared` (adapters, eval-ci, knowledge, productionize, trace) — diff both before changing a contract.
- 2026-11-19 — `platform/{grounding,prompt,structured}.ts` are re-export shims over reviewer-core — change logic in reviewer-core.
- 2026-11-19 — Migrations don't run on boot — `pnpm db:migrate` (dev.sh does it).
- 2026-11-19 — `server/docker-compose.yml` publishes 5432 on all interfaces, root one is 127.0.0.1 only — prefer root.
- 2026-11-19 — Schema contains every milestone's tables; empty tables are not dead code.
