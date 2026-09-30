# INSIGHTS.md

Notes from reviewing this repo's `CLAUDE.md` documentation set. Not
authoritative project docs — see root `CLAUDE.md` and `.claude/rules/` for
that; this is a working log of findings and open decisions.

## Codebase Patterns

- **2026-09-29** — `server/src/vendor/shared` (`@devdigest/shared`) has no
  `package.json`; it's plain `.ts` hand-copied into `client/src/vendor/shared`,
  not a real shared package → treat root `README.md`'s "one schema, every
  package" framing as aspirational, not enforced — a contract change must be
  applied to both copies by hand, and `client/CLAUDE.md` already warns about
  this. `diff -rq server/src/vendor/shared client/src/vendor/shared` shows 5
  files already differ. Evidence: `server/src/vendor/shared/`,
  `client/src/vendor/shared/`.
- **2026-09-29** — Neither root `CLAUDE.md`'s `## Commands` section nor
  `TESTING.md`'s "Running locally" steps mention `./scripts/e2e.sh` — both
  only describe running e2e against the manually-started dev stack
  (`./scripts/dev.sh` + `cd e2e && npm test`). `e2e/CLAUDE.md` marks
  `./scripts/e2e.sh` (isolated Postgres/ports, doesn't touch the dev DB) as
  the *recommended* way to run e2e; a session following only root-level docs
  would default to the non-hermetic path and risk the exact
  multiple-imported-repos pitfall `e2e/CLAUDE.md`'s Gotchas section warns
  about. Evidence: `scripts/e2e.sh`, `e2e/CLAUDE.md` Commands section,
  `TESTING.md:71-75`.
