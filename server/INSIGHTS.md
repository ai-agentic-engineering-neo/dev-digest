# server/ — Insights

Running log of gotchas, tricky bugs, and rationale for non-default decisions in
this module. Linked from [CLAUDE.md](./CLAUDE.md) — not inlined there because
this list is expected to grow and change often (volatile by design).

Format: newest first within each section. One entry = one decision or one
gotcha. Keep entries short; link to code/PR/commit for the full story instead
of re-explaining it here.

---

## What Works

## What Doesn't Work

## Codebase Patterns

### 2026-09-16 — `cost_usd` is `.nullish()` on `PrMeta` but `.nullable()` on `RunStats`/`RunSummary`
`PrMeta` rows are built in places that predate cost data and have no cost to
report (GitHub sync in `adapters/github/octokit.ts`, test fixtures in
`adapters/mocks.ts`) — `.nullish()` lets them omit the field entirely.
`RunStats`/`RunSummary` are only ever constructed at the one call site
(`modules/reviews/run-executor.ts` → `repository/run.repo.ts`) where cost is
already resolved to a value or `null`, so `.nullable()` forces that call site
to stay explicit instead of silently omitting it.

### 2026-09-16 — Per-run cost lives only on `agent_runs`, not duplicated onto `reviews`
Unlike `score`, which is denormalized onto both `agent_runs` and `reviews`
(`db/schema/reviews.ts`), `agent_runs.cost_usd` was deliberately NOT mirrored
onto `reviews` — nothing reads cost off a review row, and the PR list's
latest-cost aggregation (`modules/pulls/routes.ts`) queries `agent_runs`
directly. Don't reflexively mirror every `agent_runs` stat onto `reviews`;
only do it if something actually reads it from there.

### 2026-09-16 — Score is always recomputed from grounded findings
Models reliably return a self-reported `score` inconsistent with their own
findings list. Fix: `scoreFromFindings()` recomputes deterministically
(0 findings ⇒ 100; −35/−12/−3 per CRITICAL/WARNING/SUGGESTION) and the model's
number is discarded outright. Do not reintroduce a path that reads the model's
`score` field.

### 2026-09-16 — Shared contracts are vendored, not a real shared package
`@devdigest/shared` lives at `server/src/vendor/shared` **and separately** at
`client/src/vendor/shared` — copy-pasted, not symlinked, because there's no
workspace tool. Editing one without the other silently desyncs request/response
contracts between client and server with no compiler error until runtime.

## Tool & Library Notes

### 2026-09-16 — `reviewer-core` needs its own `npm ci`, separate from server's `pnpm install`
`server/tsconfig.json` path-aliases straight into `reviewer-core/src` (raw
source, not a built package), so `pnpm typecheck`/`pnpm test` in `server/`
fail with misleading `Cannot find module 'openai'`/`'zod'` errors — that look
like server bugs — unless `reviewer-core/node_modules` is installed
separately via `npm ci` (it's an npm package per `reviewer-core/CLAUDE.md`,
not pnpm). `./scripts/dev.sh` already does this
(`[ -d reviewer-core/node_modules ] || (cd reviewer-core && npm ci)`); a bare
`pnpm install` in `server/` alone does not.

### 2026-09-16 — `server/package.json` is `skip-worktree`
A local variant of `package.json` diverges from the committed file on some dev
machines (`git update-index --skip-worktree` hides that from `git status`).
**Consequence:** CI cannot rely on committed `test`/`typecheck` npm scripts
matching what's actually run locally — it invokes `pnpm exec vitest run …`
directly instead. If you add or rename a script, check
`git ls-files -v | grep '^S'` first or your change may silently not apply for
whoever has the skip-worktree bit set.

## Recurring Errors & Fixes

### 2026-09-16 — `db:migrate`/`db:seed` were no-ops on Windows: bad CLI-entrypoint guard
`src/db/migrate.ts:37` and `src/db/seed.ts:227` gated their CLI body on
`import.meta.url === \`file://${process.argv[1]}\``. On Windows,
`import.meta.url` is `file:///C:/...` (forward slashes) while
`process.argv[1]` is `C:\...` (backslashes) — always unequal, so the guard
silently never fires: the script exits 0 with zero output and does nothing.
Symptom was brutal to spot — `./scripts/dev.sh` reported "✓ migrations
applied"-adjacent success at every step and the API server started and
listened fine, but every table was missing (`docker exec devdigest-postgres
psql -U devdigest -d devdigest -c '\dt'` → zero relations); the only hint was
a buried non-fatal startup warning, `relation "agent_runs" does not exist`.
**Fix:** compare filesystem paths, not raw strings —
`fileURLToPath(import.meta.url) === resolve(process.argv[1])`. If you add
another `tsx`-run CLI script with this entrypoint pattern, use the fixed form
from the start; grep for `import.meta.url === ` before assuming a "successful"
CLI script run actually did anything on Windows.

## Session Notes

## Open Questions

---

<!-- Add new entries above this line within the relevant section, newest first. -->
