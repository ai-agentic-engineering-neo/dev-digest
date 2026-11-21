# Retro — SPEC-16 Ports inward, container to the edge (plans/16-server-ports-inward.md)

**Mode:** base (`workflow-retro` skill, manual invocation, plan step 9).
**Branch:** `refactor/16-server-ports-inward`, commits `563b7a1` (docs) ..
`f5b9b14` (learnings), 7 commits, `server/` only.
**Orchestration:** the plan's own §0 table executed directly by the main
session; `implement-plan` was deliberately NOT used because it skips
`test-writer` and parallel worktrees (user decision at run start).

## Summary

| Date | Workflow | Plan | Agents dispatched | Tokens | Parallelism | Bottleneck | Clarification rounds | Gate verdicts | Status |
|---|---|---|---|---|---|---|---|---|---|
| 2026-10-10 | SPEC-16 refactor via plan §0 orchestration | plans/16-server-ports-inward.md | 9 fresh `Agent` dispatches (3 test-writer, 4 implementer, 1 plan-verifier, 1 architecture-reviewer) + 3 skills (pr-self-review, engineering-insights, workflow-retro) | **not reported** — this harness returned no `usage` block for any dispatch; results arrived as idle notifications | peak 3 (T1‖T2‖T3), then 2 (I2‖I3 in worktrees), then 2 (V2‖V3) | none visible: every dispatch finished in one pass; wall-clock ~20 min from 11:10 (baseline) to 11:30 (plan-verifier PASS) | **0** across all 9 agents | plan-verifier PASS; architecture-reviewer 0 CONFIRMED HIGH+ (2 MEDIUM PLAUSIBLE); pr-self-review PASS (0 blocking, 3 medium) | complete on branch; push/PR left to the user per plan |

## Timeline (Step 1)

| # | Agent | Kind | Purpose | Usage | Outcome |
|---|---|---|---|---|---|
| 1 | `test-writer` (T1) | Agent | characterization net for `modules/repo-intel` | not reported | 2 new files, 44 tests, green |
| 2 | `test-writer` (T2) | Agent | characterization net for `modules/reviews` | not reported | 2 new files, 20 tests, green |
| 3 | `test-writer` (T3) | Agent | conventions/container/export-surface tests | not reported | 2 new + 2 extended files, 13 tests (248-name export literal), green |
| 4 | `implementer` (I1) | Agent | ports → `domain/ports`, commit 1 | not reported | `f7c4066`, 46 files, all gates green |
| 5 | `implementer` (I2) | Agent | repo-intel deps injection, worktree `.worktrees/16-i2` | not reported | `bbd21c3` → cherry-picked as `1b6ae79` |
| 6 | `implementer` (I3) | Agent | reviews/conventions injection + pure rules, worktree `.worktrees/16-i3` | not reported | `09d4873` → cherry-picked as `c2e430f`; one commit instead of 3a/3b (R3) |
| 7 | `implementer` (I4) | Agent | widen no-container rule, shrink baseline 19→10, README catalogue | not reported | `609e37e`; `eval:quality` 17 skills / 0 failures |
| 8 | `plan-verifier` (V2) | Agent | AC-1…AC-23 traceability on `563b7a1..HEAD` | not reported | PASS (caveat: pre-existing failing it-test in AC-23) |
| 9 | `architecture-reviewer` (V3) | Agent | onion review of the same range vs new baseline | not reported | 0 new violations, 0 CONFIRMED HIGH+, 2 MEDIUM PLAUSIBLE |

Orchestrator-run steps (no dispatch): 0.2 baseline, Phase 1 gate + commit,
worktree setup/teardown, two cherry-picks + gates, V1 regression, steps 7–9.

Test count trajectory: 749 passed / 1 failed (baseline, `fc35f3f`) → 826 / 1
(after T1–T3) → 826 / 1 (I1, I2) → 833 / 1 (I3, +7 unit tests) → 833 / 1
(I4). `skipped` = 0 throughout (Docker up). The 1 failure is
`test/integration.it.test.ts:76`, pre-existing since `fc35f3f`.

## Per-phase breakdown (Step 2)

| Phase | Dispatches | Tokens | Notes |
|---|---|---|---|
| 1 — safety net | 3 parallel | not reported | ~4 min wall-clock; 77 tests added |
| 2a — I1 | 1 | not reported | ~3 min |
| 2b — I2 ‖ I3 | 2 parallel | not reported | ~5 min incl. worktree setup; I2 finished 2 min before I3 and was cherry-picked early |
| 2c — I4 | 1 | not reported | ~2 min |
| 3 — verification | 2 parallel | not reported | ~3 min |

No 30%-of-total flag can be raised: no phase has a token figure. This is the
single biggest gap in this retro and is Recommendation 1.

## Signals (Step 3)

1. **Handoff efficiency.** Four `implementer` dispatches were all fresh
   `Agent` calls. Three (I2, I3, I4) followed I1. Heuristic only: I2/I3 ran in
   different worktrees with different cwd, so a continuation of the I1
   instance was not viable for them; I4 (same cwd as I1) could plausibly have
   been a `SendMessage` to the I1 instance, which had already read the plan,
   LEARNINGS and the dependency-cruiser config. Evidence: dispatch #4 vs #7.
   Mitigating: I4 touched config/docs, not the files I1 read, so the saved
   context would have been mostly the plan itself.
2. **Clarification rounds.** 0 for every agent. The plan's §0 prompts plus the
   orchestrator's added context (baseline numbers, known pre-existing
   failure, "do not commit" / "commit with this message", no-attribution
   rule) were sufficient.
3. **Artifact rework.** None observed: no file was written by two agents.
   `platform/container.ts` was edited only by I1 and I2 as the plan required;
   the Phase 1 factories were edited exactly once each by their Phase 2
   owner.
4. **Duplicated / re-derived information.** Every agent independently
   re-discovered the zsh `$PIPESTATUS` trap (T1, T2, V3 all reported an
   uncaptured exit code). All 9 agents re-read `server/LEARNINGS.md`,
   `server/CLAUDE.md` and plan §0 — expected for cold dispatches, but the
   PIPESTATUS re-derivation is pure waste and now in LEARNINGS.
5. **Misses.** (a) The orchestrator's baseline step surfaced the pre-existing
   `integration.it.test.ts` failure that the plan assumed away ("passed ≥
   N_net … skipped = S" presumes a green baseline); it had to be injected
   into every prompt by hand. (b) The plan's worktree step says `pnpm install`
   in `reviewer-core/` but `--frozen-lockfile` fails there (npm lockfile
   only) — cost one extra setup round. (c) The orchestrator ran `git stash
   -q` during diagnosis and then `git stash pop`, which pulled an unrelated
   pre-existing stash from `lesson-7-lab/multiagents-start` into the tree;
   recovered with `git reset`/`checkout`, but `.claude/settings.json`
   (git-ignored) now carries that stash's content. Self-inflicted, not a
   plan defect.

## Recommendations (Step 4)

✅ `Target: .claude/skills/workflow-retro/SKILL.md`, Step 1 — add: when the
harness delivers subagent results as idle notifications (teammate messages)
rather than inline `Agent` results with a `usage` block, record the
wall-clock from dispatch to notification timestamp per agent as the
substitute measure, and say so in the Summary table. Justified by Step 2:
this run has zero token figures, so the retro's most decision-changing
number is missing entirely.

✅ `Target: .claude/agents/implementation-planner.md` — in the section that
generates the plan's §0 "Baseline" step, require the plan to state what to
do when the baseline is NOT green (record the failing test ids, carry them
verbatim into every agent prompt, and exclude them from the "passed ≥ N"
gate arithmetic). Justified by signal 5(a): the orchestrator improvised this
for all 9 prompts.

✅ `Target: plans/16-server-ports-inward.md` is done, so the durable fix goes to
`.claude/agents/implementation-planner.md`, "worktree" guidance — when a plan
tells the orchestrator to `pnpm install` in several packages inside a fresh
worktree, the plan must name which packages have a pnpm lockfile
(`--frozen-lockfile`) and which don't (`pnpm install` + remove the generated
`pnpm-lock.yaml`). Justified by signal 5(b); the concrete trap is now in
`server/LEARNINGS.md` (2026-10-10 entry) but the planner should not rely on
the orchestrator reading it.

✅ `Target: .claude/agents/test-writer.md`, `.claude/agents/implementer.md`,
`.claude/agents/architecture-reviewer.md` — add one line to each: "capture
exit codes as `cmd > log 2>&1; rc=$?`, never via a pipe; `$PIPESTATUS` is
bash-only". Justified by signal 4: three agents in one run re-derived the
same trap and reported an unknown exit status. `RECURRING`? No — neither of
the two previous ledger entries raises it.

*(Checked `docs/retro/ledger/2026-09-08-spec06-multi-agent-review.md` and
`2026-08-12-workflow-retro-skill.md`: the 2026-09-08 entry's two
recommendations — shared Postgres across worktrees, `pnpm typecheck` after a
clean merge — are both already in root `CLAUDE.md`, and this run followed
the second one (typecheck in all four packages after the second
cherry-pick). Nothing here is RECURRING.)*
