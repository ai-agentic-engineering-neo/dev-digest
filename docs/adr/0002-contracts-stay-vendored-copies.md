# 0002 — Zod contracts stay as two vendored copies, guarded by CI

Status: Accepted · 2026-11-25 · plan item X2c

## Context
The API contracts live in `server/src/vendor/shared` (source of truth) and a copy
in `client/src/vendor/shared`. They had drifted (5 files). There is no monorepo
workspace: client and server use pnpm, reviewer-core and e2e use npm, each with
its own lockfile, and reviewer-core aliases the server copy. A real shared
package would need a workspace (or a published package), Next.js
`transpilePackages`, and CI changes in every workflow. A known trap makes the
client side fragile: the barrel re-exports with `.js` extensions that webpack
can't resolve, so the client may only import types from `@devdigest/shared`
(enforced by ESLint; see client/INSIGHTS.md).

## Decision
Keep the two copies. `scripts/check-contracts.sh` (client CI) fails when they
differ; contracts are changed in `server/` and copied with
`cp -R ../server/src/vendor/shared/. src/vendor/shared/`.

## Consequences
- Drift is caught in CI instead of in the UI.
- Each contract change is a two-file commit; reviewers see both.
- Runtime schemas in the client must come from the single contract file, not the
  barrel (e.g. `@/vendor/shared/contracts/trace`).

## Revisit when
- a third consumer appears (e.g. the CI agent-runner as a separate package), or
- the repo moves to a pnpm workspace for other reasons, or
- the copy step is forgotten often enough that the CI check is a recurring blocker.
