# INSIGHTS — e2e

Non-obvious learnings for this module, maintained by the `engineering-insights` skill.
Read before non-trivial changes. **Append-only**: correct an entry with a dated
`CORRECTION:` bullet below it; don't edit or delete. Promote an entry to `AGENTS.md`
only if an agent is likely to hit it on most tasks. Prune in a periodic human review
when the file passes ~200 entries.

<!-- Entry: - YYYY-MM-DD · <ALWAYS/NEVER/do X> because <why> — evidence: path/to/file.ts (symbol) -->

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes
- 2026-11-27 · ALWAYS keep `NEXT_DIST_DIR=.next-e2e` in scripts/e2e.sh because sharing `client/.next` with a running dev server made :3000 call the e2e API on :3101 (no data in the dev UI); `next dev` also rewrites the tracked `client/next-env.d.ts` to the distDir, so the teardown trap restores it and tsconfig pre-lists `.next-e2e/types/**/*.ts` to stop Next editing tsconfig — evidence: scripts/e2e.sh (NEXT_DIST_DIR, cleanup)
- 2026-11-27 · `../scripts/e2e.sh` brings the whole stack up and only then fails with `sh: tsx: command not found` when `e2e/node_modules` is missing — the script installs server/client/reviewer-core deps but NOT e2e's; run `cd e2e && npm ci` once first — evidence: scripts/e2e.sh (deps install block, `cd e2e && npm test`)
- 2026-11-26 · Flows 02/04/05 fail locally but pass in CI (land on the wrong repo): they follow the home redirect to the first repo and assume seeded `acme/payments-api` is the only one, but a dev DB usually has more — run `../scripts/e2e.sh` (isolated, freshly seeded stack). Never reset the dev DB with `docker compose down -v`.

## Session Notes

## Open Questions
