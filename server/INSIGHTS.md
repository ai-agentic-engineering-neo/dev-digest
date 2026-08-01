# server — insights

Durable findings recorded by the `engineering-insights` skill: things that are
true about this code but not visible in it. Append-only — correct a stale entry
with a dated note beneath it rather than editing it away.

Sections are fixed. Add to the one that fits; never invent a new heading.

## What Works

## What Doesn't Work

- **2026-07-29** — A green `pnpm test` does not mean the integration tests ran: `*.it.test.ts` files self-skip when no Docker daemon is reachable, so a machine without Docker reports success having exercised none of the DB paths. Evidence: `server/test/helpers/pg.ts:10`.

- **2026-07-29** — `TESTING.md:43` promises a Windows `typecheck` job as the `@ast-grep/napi` prebuilt gate; the gate no longer exists, so a missing win32 prebuilt now reaches users uncaught. Evidence: commit `b7838c8` *"ci(server): drop the Windows typecheck matrix"*.

- **2026-07-29** — `TESTING.md:83` explains the test-lane invocation by claiming `server/package.json` is `skip-worktree`; it is not, in a fresh clone, so anyone reasoning from that premise is reasoning from a local artifact. Evidence: `git ls-files -v | grep -v '^H'` returns nothing. The consequence it describes still holds — CI calls `pnpm exec vitest run …` because no `test:unit` / `test:integration` scripts are committed.

## Codebase Patterns

- **2026-07-29** — Twelve tables in `src/db/schema/` have zero references outside their own schema file and are meant to stay empty until a course lesson fills them, so an unused table is not dead code. Evidence: `server/README.md:9-14`.

  `ci_installations` · `ci_runs` · `code_chunks` · `composed_reviews` ·
  `conformance_checks` · `digests` · `eval_cases` · `eval_runs` ·
  `installed_plugins` · `multi_agent_runs` · `pr_brief` · `skill_versions`

- **2026-07-29** — `modules/reviews/repository.ts` and `modules/reviews/repository/` are one design, not a duplicate: the file is the facade (the only DB layer for the review domain), the directory holds query implementations split by aggregate. Evidence: `src/modules/reviews/repository.ts:11`. Add queries in the directory; keep the facade as the entry point.

- **2026-07-29** — `platform/prompt.ts` and `platform/prompts.ts` differ by one character and do unrelated jobs: the first is a re-export shim over `reviewer-core` for per-request data, the second a template loader for `src/prompts/*.md` with `{{var}}` interpolation. Evidence: `src/platform/prompts.ts:1-12`.

- **2026-07-29** — Three files in `src/platform/` are pure re-exports of `@devdigest/reviewer-core` and must not be edited to change behaviour: `prompt.ts`, `grounding.ts`, `structured.ts`. Evidence: `src/platform/grounding.ts:1-6`.

## Tool & Library Notes

- **2026-07-29** — `pnpm db:migrate` dumps raw Postgres NOTICE objects (`'extension "vector" already exists, skipping'`, code 42710) that read like errors but are idempotent skips — the run is fine iff it ends with `✓ migrations applied`. Evidence: `src/db/migrate.ts` sets no `onnotice` handler, so the `postgres` client logs every notice to stderr.

## Recurring Errors & Fixes

## Session Notes

- **2026-07-29** — Entries above were split out of the root `INSIGHTS.md` when per-module files were introduced; they came from a repo-wide sweep done while writing the `CLAUDE.md` files.

## Open Questions
