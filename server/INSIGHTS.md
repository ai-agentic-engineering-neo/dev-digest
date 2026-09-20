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

### 2026-09-19 — Onion layering is now machine-checked; the baseline (42 entries) may only shrink
`server/.dependency-cruiser.cjs` + `pnpm arch:check` (CI job `arch` in `server-unit.yml`) enforce inward-only imports over the flat per-module files; rules/rationale in `.claude/skills/onion-architecture/`. Pre-existing debt is frozen in `.dependency-cruiser-known-violations.json` (routes running Drizzle in `pulls|polling|settings|workspace`, ORM row types in `repos/helpers.ts` + `reviews/*`, whole-`Container` in every service, `repo-intel` importing concrete adapters). Never add to the baseline to make CI green — fix the import or move the code; run `pnpm arch:baseline` only after fixes and check the diff is removals-only.

### 2026-09-18 — PR-list SCORE/STATUS/FINDINGS now dedupe to each agent's LATEST review, not every review ever
`server/src/modules/pulls/routes.ts`'s aggregation previously counted EVERY
completed `reviews` row for a PR when computing lowest score, worst verdict,
and summed findings — a re-run of the same agent stacked its stale first pass
on top of the clean re-run, so a PR could show a permanently bad
score/status/findings from a superseded run. Fixed per explicit user request:
`reviews` rows are now deduped by `(prId, agentId)`, ordered `desc(createdAt)`
with first-seen-per-key kept, so re-running an agent SUPERSEDES its prior
review rather than adding to the aggregate; a different agent's latest review
still contributes alongside it. A null `agentId` can't be deduped against
other runs, so each such review is grouped by its own row id (never merged
with other unattributed reviews).

### 2026-09-18 — COST aggregation deliberately stays "every run", NOT "latest per agent"
Unlike score/status/findings (entry above), the COST query
(`agent_runs.cost_usd`, summed over `status='done'`) intentionally still
counts every completed run, including re-runs of the same agent — cost is
real money spent, so every attempt counts, not just the latest. This is an
asymmetry between the two aggregations, not an oversight; see the comment
above the cost query in `routes.ts`.

### 2026-09-18 — `findings: null` must mean "no review yet", never "zero findings on the latest review"
While testing the latest-per-agent fix above, found that a PR whose only
qualifying review has zero findings was returned as `findings: null` —
indistinguishable from "no completed review exists at all" (also `null`),
because the findings map was only ever populated by iterating actual finding
rows via an inner join. Fixed by explicitly zero-filling `findingsByPr` for
every PR with at least one qualifying review, even when that review (or all
of a PR's latest-per-agent reviews) has no findings. `null` is now reserved
strictly for "no completed review yet" — don't let a zero-count case fall
through to it again in a future aggregation change here.

### 2026-09-18 — Mirroring a vendored contract file: copy whole-file when both copies started identical
When `client/src/vendor/shared/contracts/platform.ts` and
`server/src/vendor/shared/contracts/platform.ts` are confirmed byte-identical
(`diff` returns nothing) before editing, the safest way to mirror a multi-part
change (new `PrStatus` value + new `PrMeta.findings` field, this session) is
to make the edit once and then `cp` the whole file across, not hand-apply the
same diff twice — avoids a transcription slip silently desyncing the two
copies (see the existing "Shared contracts are vendored" entry below for why
that's dangerous).

### 2026-09-18 — `reviews` rows only ever exist for successfully completed runs — no need to join `agentRuns.status`
Confirmed by reading `modules/reviews/run-executor.ts:219-229`: `insertReview`
is called only after `reviewPullRequest(...)` resolves without throwing. The
PR-list score/verdict/findings aggregation queries in `modules/pulls/routes.ts`
therefore read straight from `reviews`/`findings` with no join to
`agent_runs.status='done'` — unlike the pre-existing cost query, which DOES
join `agent_runs` because it reads `agent_runs.cost_usd` directly, a different
table with rows for in-flight/failed runs too. Don't add an unnecessary status
join here; it would be redundant.

### 2026-09-18 — PR-level STATUS now also aggregates across every completed run, unscoped to the current head
`deriveReviewStatus` (`modules/pulls/status.ts`) gained an optional
`worstVerdict` param and a new `changes_requested` `PrStatus`, returned
whenever ANY completed review on the PR has `verdict='request_changes'` —
checked BEFORE the head-freshness check, so a past request-changes verdict
still shows even if a newer head hasn't been re-reviewed. This mirrors how
cost/score already aggregate across the PR's whole run history rather than
just the latest head; see the function's jsdoc for the full rationale.

### 2026-09-18 — `rollupSeverities` was dead code until the PR-list FINDINGS column needed it
`modules/pulls/status.ts`'s `rollupSeverities` existed only for its own unit
test since it was added. Its first real caller is the new findings-aggregation
query in `modules/pulls/routes.ts` (`findings` joined to `reviews`, grouped in
JS per PR, `rollupSeverities` called once per group).

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

### 2026-09-19 — dependency-cruiser 17.4: four quirks that break the docs' recipe
(1) No `--baseline` flag (the `main` docs describe a newer CLI) — generate with `depcruise src --config … --output-type baseline > .dependency-cruiser-known-violations.json`; no `shrink-only` mode, so review the diff by hand. (2) `tsPreCompilationDeps: true` is mandatory, otherwise `import type` / `typeof t.x.$inferSelect` leaks are invisible (TS elides them). (3) `dependencyTypesNot: ['type-only']` on a `circular` rule only exempts cycles whose *first* edge is type-only — `Container ↔ RepoIntelService` still reports. (4) Drizzle edges resolve to `node_modules/.pnpm/drizzle-orm@<ver>…`, so baseline entries for them go stale on upgrade (regenerate, confirm count unchanged). Because `package.json` may be skip-worktree (below), CI runs `pnpm exec depcruise …` inline rather than `pnpm arch:check`.

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

### 2026-09-18 — Deleting a review left an orphaned Timeline tile: two tables, one unenforced link, one-way cleanup
`reviews` and `agent_runs` represent the SAME run from two angles (Review-runs
section vs. Timeline), linked only by a bare `reviews.run_id` uuid column —
no FK (unlike `run_traces.run_id`, which DOES have a real FK with
`onDelete: cascade` back to `agent_runs`). `deleteAgentRun`
(`repository/run.repo.ts`, Timeline's delete) already manually deleted the
matching `reviews` row via `eq(reviews.runId, runId)`. `deleteReview`
(`repository/review.repo.ts`, Review-runs section's delete) did NOT do the
reverse — it only deleted `reviews` (+ findings via a real FK cascade),
leaving the `agent_runs` row, and thus its Timeline tile, behind forever.
User-reported as "agent runs out of sync with the timeline" after deleting
from the Review-runs section. **Fix:** `deleteReview` now also deletes the
matching `agent_runs` row (via the deleted review's `run_id`), whose own
cascade cleans up `run_traces` too — symmetric with `deleteAgentRun`. Covered
by `server/test/reviews-delete.it.test.ts` (checks both delete paths against
the other table). **Lesson:** whenever two tables represent the same
real-world entity via a non-FK link, audit BOTH delete paths for symmetry
before shipping either one — a real FK would have caught this via a
constraint/cascade; a bare uuid column lets the tables silently drift apart.

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
