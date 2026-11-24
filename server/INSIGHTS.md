# INSIGHTS — non-obvious lessons: package server

Append-only log: entries are only ADDED to the end of a section via `node .claude/skills/engineering-insights/scripts/insights.mjs append`; existing ones are never edited or deleted (the guard hook blocks Write/Edit that change text).
Format: `- YYYY-MM-DD · <area> · <fact/symptom> → ALWAYS/NEVER <action>, because <reason> · <evidence: path + symbol / command / error text>` (trailing `[?]` = hypothesis, not yet confirmed).
Selection rules, review and promotion to CLAUDE.md — skill `engineering-insights`. This is a draft under human review, not the truth.

## What Works

## What Doesn't Work

## Codebase Patterns

- 2026-11-20 · run-executor · the catch path persists tokensIn/tokensOut = 0 because reviewPullRequest throws without partial usage → stream per-call metrics out of reviewer-core via a callback (like onEvent) if failed/cancelled runs must keep them, because the thrown error carries nothing · run-executor.ts catch block, reviewer-core/src/review/run.ts
- 2026-11-20 · JobRunner · a rejected promise nobody subscribes to (e.g. EnqueuedJob.done from fire-and-forget enqueue) is an unhandledRejection, and Node ≥15 kills the whole API — one failed clone (GitHub 403) took :3001 down → ALWAYS attach a handler (.catch) to any promise you create but don't await in long-lived server code, because a background failure must land in the jobs row, not crash the process · src/platform/jobs.ts enqueue(), repos/service.ts refresh()/add()

## Tool & Library Notes

- 2026-11-24 · drizzle tx typing · with drizzle-orm 0.45 + postgres-js, the tx passed to db.transaction() typechecks as our Db (PostgresJsDatabase<typeof schema>) — no Db|Tx union is needed → give repositories a Db constructor param and build tx-bound instances inside db.transaction for a Unit of Work, because many guides add a Tx type that is redundant here (verified with tsc, not assumed) · src/db/client.ts Db type; server/src has no db.transaction yet
- 2026-11-24 · depcruise baseline + pnpm · .dependency-cruiser-known-violations.json stores npm targets as pnpm store paths with versions/peer hashes (node_modules/.pnpm/drizzle-orm@0.45.4_gel@…/), so after ANY dependency bump the CLI's --ignore-known stops matching those entries and reports them as new → trust test/architecture.test.ts (it compares npm targets by package name; verified by rewriting versions in the baseline), and regenerate the baseline after a bump only if you want the CLI output clean, because the raw file is version-pinned · server/test/architecture.test.ts normalizeTarget()
- 2026-11-24 · dependency-cruiser exports map · require.resolve('dependency-cruiser/package.json') throws ERR_PACKAGE_PATH_NOT_EXPORTED (its exports map omits package.json), so a test can't locate the bin that way → use path.join(serverRoot, 'node_modules/dependency-cruiser/bin/dependency-cruise.mjs'), because pnpm always links direct deps at server/node_modules/<name> · server/test/architecture.test.ts

## Recurring Errors & Fixes

## Session Notes

## Open Questions
