# Insights

Non-obvious findings, decisions, and lessons learned while working in
`server/` that aren't already captured in [CLAUDE.md](CLAUDE.md) or
[README.md](README.md). Populated by the `engineering-insights` skill.
Append-only — add new dated entries, never edit or remove existing ones.

<!-- ### YYYY-MM-DD — short title
What was surprising, and why it matters. -->

## What Works

## What Doesn't Work

## Codebase Patterns

### 2026-09-20 — "latest run per PR" is a read-time derivation, not a denorm column
`pulls/routes.ts:119` (SCORE: `latestReviewByPr`, ordered `desc(reviews.createdAt)`,
first-seen-per-`prId` wins) is the established pattern for a per-PR-list-row
stat computed from `agent_runs`/`reviews` at read time via one `IN (...)`
query + JS `Map`, no FK/denorm column on `pull_requests`. NOTE: COST does
*not* reuse this "latest wins" reduction — see the Recurring Errors entry
below on why it needed SUM instead (`pulls/routes.ts:138-146`,
`totalRunCostByPr`). Use "latest wins" only when the stat is genuinely
per-run (e.g. current review status); use SUM/aggregate when the stat is a
running total across a PR's history.

### 2026-09-21 — three PR-list stats, three DIFFERENT aggregation rules (don't assume they match)
`pulls/routes.ts` computes SCORE, FINDINGS, and COST for the list with three
genuinely different reductions over the same `agent_runs`/`reviews` history,
and they were repeatedly conflated mid-session before landing here — worth
being explicit:
- **SCORE**: single overall "latest review wins", no per-agent grouping at
  all (`latestReviewByPr`, ~line 118).
- **FINDINGS** (`findingsBySeverityByPr`, ~line 158): latest run **per
  distinct agent** (keyed by `reviews.agentId ?? review.id`), summed across
  agents. Rationale: reflects *current outstanding issues* — a superseded
  run's stale findings shouldn't count forever.
- **COST** (`totalRunCostByPr`, ~line 214): sum of **every** successful run,
  no per-agent dedup at all. Rationale: cost is money already spent, not
  current state — re-running an agent doesn't erase the earlier run's real
  spend. This one briefly got changed to match FINDINGS' per-agent-latest
  rule (matching a literal reading of "same principle as COST" in an early
  request) and had to be reverted once the user clarified cost must reflect
  total actual spend. Lesson: when two stats sound like they "should" follow
  the same rule because they're computed from the same tables, check
  whether the *domain meaning* (a running total vs. a current-state snapshot)
  actually calls for the same reduction — it often doesn't.

### 2026-09-20 — a reverted commit is still a valid reference via `git show`
Commit `93119a5` ("run cost badge") implemented `agent_runs.cost_usd` end to
end but was reverted from `main` by `c6af1e4` as collateral damage of an
unrelated "restore starter state" revert — the cost feature itself wasn't
rejected. It's still reachable (`git show 93119a5 -- server/src/db/schema/runs.ts`
etc.) and was used as a near-complete template when re-implementing the same
field this session (see the two entries below on where its exact approach
didn't fit). Worth checking `git log -p --all` / reflog for a prior attempt
before designing a feature from scratch, especially anything mentioning
observability/cost — `contracts/observability.ts:46,82,108-109` and
`contracts/productionize.ts:152-153,177` already declare `cost_usd` /
`total_cost_usd` / `avg_cost_usd` fields with no route building them yet —
groundwork for a not-yet-built aggregate-cost-dashboard feature.

## Tool & Library Notes

### 2026-09-20 — `tsconfig.json`'s `include` excludes `server/test/` entirely
`server/tsconfig.json:28` is `"include": ["src/**/*.ts"]` — it has never
covered `test/**/*.ts`. Effects: (1) `pnpm typecheck` (`tsc --noEmit -p
tsconfig.json`) never type-checks any test file; (2) the IDE's TS server,
finding no project that includes an open test file, falls back to default
compiler options — producing false-positive TS2307 (`@devdigest/shared`
unresolvable, no `paths`) and TS1378 (top-level `await` needs a modern
target) on files that are actually fine; (3) Vitest itself never hits this
because `vitest.config.ts` transpiles via esbuild with its own
`resolve.alias`, bypassing tsc entirely. Confirmed by temporarily adding
`test/**/*.ts` to `include` and re-running `tsc`: those two error classes
disappear, but ~11 *other*, pre-existing type errors surface across
`adapters.test.ts`, `agents-versions.it.test.ts`, `prompt-callers.test.ts`,
and `repo-intel-facade-degraded.test.ts` — so widening `include` is a real,
separate cleanup task, not a one-line fix.

## Recurring Errors & Fixes

### 2026-09-20 — a field returned by an LLM adapter can be silently dropped downstream
All three `LLMProvider` adapters compute and return `costUsd` on every
`CompletionResult`/`StructuredResult` (`adapters/llm/openai.ts:84,122`,
`adapters/llm/anthropic.ts:85,135`, `reviewer-core/src/llm/openrouter.ts:107`),
and `reviewer-core/src/review/run.ts:159,184,216` accumulates it into
`ReviewOutcome.costUsd` — but `run-executor.ts:213` destructured only
`const { tokensIn, tokensOut, grounding } = outcome;` (no `costUsd`), so it
was computed on every review run and thrown away before this session (fixed
at `run-executor.ts:213,248,269`, now `const { tokensIn, tokensOut, costUsd,
grounding } = outcome;`). When a provider/adapter type has a field that
isn't in the destructuring pattern a few layers up, grep for every
consumer's destructure list — don't assume "it's in the type so it's used."

### 2026-09-20 — re-implementing a reverted feature: don't just copy the old diff's semantics
When re-adding `agent_runs.cost_usd` this session (see the reverted-commit
entry above), the first pass at `pulls/routes.ts` copied the reverted
commit's exact approach: "latest `status='done'` run's cost, first-seen-per-
`prId` wins" (same reduction as the SCORE column). That was wrong for THIS
task's actual spec, which required the PR list's cost to be the SUM of every
successful run's cost, not just the latest one's — caught only after
checking the grading rubric, not from re-reading the reference commit. Fixed
at `pulls/routes.ts:132-146` (`totalRunCostByPr`, accumulated in a loop,
`null`-cost runs skipped rather than counted as 0) plus a regression test at
`test/reviews.it.test.ts` (`"PR list's COST column is the SUM of every
successful run, not just the latest"`) that runs the same PR through review
twice and asserts the list value equals the sum of both runs, not either
one alone. Lesson: a prior implementation (even a validated one) encodes
*a* set of semantics, not necessarily *this* task's semantics — verify the
actual spec/rubric line, don't assume the reference commit already got it
right for your case.

### 2026-10-03 — a breaking shape change in `reviewer-core` silently fails a server test that imports it via a re-export shim
`reviewer-core`'s `PromptParts.skills` changed from `string[]` to
`SkillBlock[]` (`{ name, body, tokens, untrusted }`, `prompt.ts:39-45`), and
`PromptAssembly.skills` changed from a joined string to
`PromptAssemblySkill[] | null` in lockstep (both server's and client's
vendored `contracts/trace.ts`). `server/test/prompt-structured.test.ts:16-27`
still calls `assemblePrompt` (via the `platform/prompt.ts` re-export shim)
with the old `skills: ['## secret-gate\n...']` string-array shape and asserts
`assembly.skills).toContain('secret-gate')` — both now fail, because `tsc`
doesn't typecheck `server/test/**` (see the Tool & Library Notes entry on
`tsconfig.json`'s `include`) so the shape mismatch only surfaces at
*runtime*, in vitest, not at `pnpm typecheck`. Not caused by any change in
`server/src/modules/reviews/` — fix belongs with whoever owns the
`SkillBlock` migration, by updating this test's fixture + assertion to the
new shape.

## Session Notes

### 2026-09-20 — added `agent_runs.cost_usd` end-to-end
Added the column (migration `0010_stormy_medusa.sql`), stopped
`run-executor.ts` from dropping `outcome.costUsd`, threaded it through
`run.repo.ts` (`completeAgentRun`, `listRunsForPull`) and the PR-list route,
and added `cost_usd` to `PrMeta`/`RunSummary`/`RunStats` in both vendor
contract copies. Server-side only — see `client/INSIGHTS.md` for the UI half.

### 2026-09-20 — added `findings_by_severity` to the PR-list endpoint
`pulls/routes.ts:132-152` adds one grouped query (`findings` inner-joined to
`reviews`, `groupBy(reviews.prId, findings.severity)`, restricted to the
already-computed latest-review ids) alongside the existing score/cost
derivations — same "latest review, not a sum" semantics as SCORE (contrast
with COST, which sums across every run — see the entry above on why COST
needed a different reduction than SCORE; FINDINGS follows SCORE's rule, not
COST's, because "N findings IN THIS RUN" is explicitly per-run by spec). No
existing per-severity breakdown existed anywhere server-side before this —
confirmed by grep across `modules/reviews/repository/*` before adding it.

### 2026-09-20 — added ESLint (flat config) — only 7 warnings, 0 errors, repo-wide
Added `eslint@^10` + `@eslint/js` + `typescript-eslint` recommended (non
type-checked) via `eslint.config.js:1-27`, `argsIgnorePattern: '^_'` to match
the existing unused-param convention. Full `pnpm lint` over the whole
package surfaced only 7 pre-existing warnings (unused imports/vars in
`repo-intel/pipeline/incremental.ts:112`, `modules/settings/routes.ts:3`,
three test files) and zero errors — this codebase was already clean by
construction, not because of any prior lint tool. All fixed same session.
`src/vendor/**`, `src/db/migrations/**`, and `dist/**` are excluded from
lint (vendored/generated, not this package's own style to enforce).

### 2026-10-03 — wired linked agent skills into the review prompt
`run-executor.ts`'s `runOneAgent` called `reviewPullRequest(...)` with no
`skills` key, so `AgentsRepository.linkedSkills()` (`agents/repository.ts:207`,
already joins `agent_skills ⋈ skills` ordered by `agent_skills.order`) was
never consulted for a review run — every agent's linked skills were dead
weight. Added `resolveAgentSkills(agentId)` (`run-executor.ts:432-447`):
calls `this.agents.linkedSkills(agentId)`, filters to `skill.enabled` (the
repo method intentionally does NOT filter this — by design, so the Skills
editor can still list/toggle disabled links), maps to reviewer-core's
`SkillBlock` (`{ name, body, tokens: this.container.tokenizer.count(body),
untrusted: source !== 'manual' }`), and passes the result as `skills` into
`reviewPullRequest`. No DB-backed test exists for `run-executor.ts` (there
never was one before this) — added
`test/run-executor-skills.test.ts`, a hermetic unit test that builds a
`ReviewRunExecutor` with minimal fakes for `container.tokenizer` and
`agents.linkedSkills` (no real `Container`/`Db` needed) and calls the private
`resolveAgentSkills` via a cast, asserting enabled-only/ordered/`untrusted`
derivation.

## Open Questions

### 2026-09-20 — should `tsconfig.json` `include` cover `test/**`?
Doing so is straightforward but surfaces ~11 pre-existing type errors in
other test files (see the Tool & Library Notes entry above) — someone needs
to decide whether to fix those in the same change or gate them off first.

### 2026-09-20 — `setupRepoAndPr` is duplicated across two integration tests
`test/reviews.it.test.ts` and `test/pulls-comments.it.test.ts` each define
their own ~90-line `setupRepoAndPr(db, workspaceId)` helper (repo + PR +
prFiles fixture), independently. Worth extracting to a shared
`test/helpers/` module next time either file is touched.
