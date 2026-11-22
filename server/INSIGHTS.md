# server — INSIGHTS

Append-only log of non-obvious things learned. Read before working, write only what is new.
Entry: `YYYY-MM-DD — claim — why / what to do (`path` · `symbol`)`. No line numbers.

## What Works
<!-- Approaches that succeeded after alternatives were weighed or tried. -->

## What Doesn't Work
<!-- Dead ends and antipatterns, with the reason. Most valuable section. -->

- 2026-11-19 — `server/docker-compose.yml` publishes 5432 on all interfaces, root one is 127.0.0.1 only — prefer root.

## Codebase Patterns
<!-- Conventions and architecture decisions not obvious from a single file. -->

- 2026-11-19 — `src/vendor/shared` differs from `client/src/vendor/shared` (adapters, eval-ci, knowledge, productionize, trace) — diff both before changing a contract.
- 2026-11-19 — `platform/{grounding,prompt,structured}.ts` are re-export shims over reviewer-core — change logic in reviewer-core.
- 2026-11-19 — Schema contains every milestone's tables; empty tables are not dead code.

- 2026-11-19 — `GET /repos/:id/pulls` now returns `findings: PrFindingPreview[]` (open findings of the newest review per agent; rationale cut to 240 chars) — `PrMeta` is edited identically in `server/` and `client/src/vendor/shared/contracts/platform.ts` (also noted in client/INSIGHTS.md) (`modules/pulls/findings.ts` · `aggregatePrFindings`).

## Tool & Library Notes
<!-- Dependency / CLI quirks, versions. -->

## Recurring Errors & Fixes
<!-- `exact error text` — cause — fix. -->

- 2026-11-19 — Migrations don't run on boot — `pnpm db:migrate` (dev.sh does it).
- 2026-11-19 — `Could not find a working container runtime strategy` — cause: Docker is Rancher Desktop (socket `~/.rd/docker.sock`), yet `dockerAvailable()` still returns true so `*.it.test.ts` fail instead of skipping — fix: run with `DOCKER_HOST=unix://$HOME/.rd/docker.sock TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock` (`test/helpers/pg.ts`).
- 2026-11-19 — `pnpm db:generate` fails with `drizzle-kit: exec: node: not found` plus a pnpm "lockfile entries failed verification (minimumReleaseAge)" install error — cause: pnpm's pre-run install check, and nvm's node is not on the agent shell PATH — fix: prepend the nvm node `bin` to PATH and run `./node_modules/.bin/drizzle-kit generate` directly (bypasses the install check).

## Session Notes
<!-- ### YYYY-MM-DD — task, then 1–3 bullets of what was added. -->

### 2026-11-19 — Run Cost Badge (persist `agent_runs.cost_usd`)
- Added two Recurring Errors: Testcontainers under Rancher Desktop, and `db:generate` failing in the agent shell. Spec: `specs/01-run-cost-badge.md`.

## Open Questions
<!-- - [ ] YYYY-MM-DD — question — look at: … -->
