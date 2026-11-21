# Bad vs good entries

Every good entry names a concrete thing (file, function, limit, command), says
what to do, and says **why**. Every bad one is advice anyone could give without
seeing this repo.

> The good examples show the *shape* only. They are illustrations written
> against this repo's stack, **not verified facts** about this codebase. Never
> copy them into INSIGHTS.md.

## Rejected outright (fail the quality gate)

| Candidate | Why rejected |
|---|---|
| "Promises can be tricky" | noise: no file, no action |
| "Be careful with async" | vague: careful *how*, *where*? |
| "Tests are important" | generic truism |
| "Fixed a bug on line 47 of parser.py" | history, not a lesson; the line number will rot |
| "Use TypeScript strict mode" | already in tsconfig and docs: obvious from the code |
| "CI was flaky once, rerun fixed it" | transient, one-off |

## What Works

❌ "Batching helps performance."

✅
```markdown
### 2026-03-24 — Embed repo-intel chunks with allSettled in batches of 10
**Insight:** `Promise.all()` over all chunks times out after ~30 files, and one rejection drops the whole batch.
**Rule:** ALWAYS embed with `Promise.allSettled()` in batches of 10 — because partial failures must not lose the rest of the index.
**Evidence:** `server/src/repo-intel/indexer.ts` → `embedChunks()`, test `indexes 100 files`
```

## What Doesn't Work

❌ "Mocking was hard."

✅
```markdown
### 2026-03-24 — Don't mock Drizzle in route tests
**Insight:** Tried `vi.mock('../db')`. The query builder is chained, so the mocks diverged from real SQL: the tests passed while the real query failed.
**Rule:** NEVER mock Drizzle — because chained-builder mocks test the mock, not the SQL; use the test Postgres from `server/CLAUDE.md`.
**Evidence:** reverted attempt; test `GET /reviews returns findings`
```

## Codebase Patterns

❌ "Be careful with state."

✅
```markdown
### 2026-03-24 — Review list cache key lives in one helper
**Insight:** Three components invalidate the review list; ad-hoc `['reviews']` keys missed the repo-scoped variant and showed stale data.
**Rule:** ALWAYS build TanStack Query keys via `reviewKeys.*` — because invalidation only matches keys built the same way.
**Evidence:** `client/src/lib/query-keys.ts` → `reviewKeys`
```

## Tool & Library Notes

❌ "pgvector has limits."

✅
```markdown
### 2026-03-24 — ivfflat index ignored until ANALYZE
**Insight:** Right after a bulk insert, similarity queries did a seq scan: the planner had no stats for the new rows.
**Rule:** ALWAYS run `ANALYZE <table>` after bulk-loading embeddings — because the planner skips the index without stats.
**Evidence:** `server/src/repo-intel/store.ts` → `bulkInsert()`; `EXPLAIN` showed Seq Scan
```

## Recurring Errors & Fixes

❌ "Watch out for env errors."

✅
```markdown
### 2026-03-24 — "Cannot find module '@reviewer-core/…'" in server tests
**Insight:** reviewer-core is consumed as TS source via a tsconfig path alias; vitest doesn't read tsconfig paths on its own.
**Rule:** ALWAYS mirror new path aliases in `server/vitest.config.ts` `resolve.alias` — because tsc and vitest resolve modules separately.
**Evidence:** `server/vitest.config.ts` → `resolve.alias`; `pnpm test` error text above
```

## Session Notes

❌ "Worked on reviews today, made progress."

✅ `- 2026-03-24 — webhook auth: moved HMAC check to header; see "HMAC lives in the header, not the body"`

## Open Questions

❌ "Not sure about performance."

✅ `- 2026-03-24 — Why does the indexer re-embed unchanged files after a rebase? (context: server/src/repo-intel/indexer.ts → diffFiles())`

## Superseding a wrong entry

```markdown
### 2026-03-10 — Run migrations before seeding
**Insight:** …
**Rule:** …
**Evidence:** …
> **Superseded 2026-04-02:** `./scripts/dev.sh` now runs migrations itself; see "dev.sh owns migrations".
```
