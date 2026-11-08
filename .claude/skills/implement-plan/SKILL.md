---
name: implement-plan
disable-model-invocation: true
description: >-
  Executes an approved Implementation Plan (plans/<feature>.md, written by the implementation-planner
  agent) wave by wave in the plan's Execution mode — multi-agent: one implementer-backend /
  implementer-frontend subagent per task in parallel; single-agent: the main session does the tasks
  itself one by one — then runs the
  wave gate (ownership diff, every task's Verify, package typecheck, layer check), records task status in
  the plan, stops on BLOCKED or a red gate, and feeds implementers' insight candidates to
  engineering-insights. Manual only: /implement-plan plans/<feature>.md [--wave N] [--task T<n>].
  Also on "виконай план", "запусти імплементерів", "implement the plan".
metadata:
  version: "1.1.0"
  updated: "2026-11-06"
---

# Implement plan

You (the main session) are the orchestrator. In **multi-agent** mode implementers write code; you launch
them, check their work against the plan, keep the plan's statuses true, and stop when something is
wrong — you don't write feature code yourself except the small gate fixes allowed in step 5. In
**single-agent** mode you are also the implementer (step 2b); everything else stays the same.

Args: `plans/<feature>.md` (required) · `--wave N` (run only that wave) · `--task T<n>` (re-run one task).
Commands for every package: `plans/README.md` → "Verify commands" (Windows: bins via `node`).

## 0. Preflight

1. Read the plan in full. Plan `Status` must be `approved` or `in progress` — `draft` → stop and ask the
   user to review/approve it. Non-empty "Open questions" → stop and ask.
2. Read `Execution mode`: `multi-agent` or `single-agent`. Missing (plans written before the field
   existed) → `multi-agent`, and say so. The user may override it for this run in the prompt. The
   implementation-planner's rule: multi-agent if the plan has ≥ 6 tasks AND some wave has ≥ 2
   independent tasks, otherwise single-agent.
3. Validate the plan: every task has `Status`, type `[backend]|[frontend]`, Files, Verify; the File
   ownership map has no file twice; a wave has ≤ 1 migration task, and in multi-agent mode ≤ 4 tasks.
   If `Specs:` lists a `SPEC-NN`: every linked spec has `Status: approved` (or `implemented`) and no
   `[NEEDS CLARIFICATION`, and every task has `Covers:` (only W0 / integration may write "— (<why>)").
   Plans without Spec IDs are legacy: skip that check and say so. Broken → stop, report.
4. `git status --porcelain` → save as the **baseline** (pre-existing changes are not the wave's).
   Uncommitted changes in files the plan owns → ask before starting.
   `git rev-parse --short HEAD` → save as the **plan base** (the `base:` sent to wave 1; used in §7).
5. Set plan `Status: in progress` (edit only that line).

## 1. Pick the wave

The lowest wave with a task in `todo` (or the one given by `--wave`). Every `Depends on` of its tasks
must be `done`; otherwise stop and report which dependency is missing.

## 2. Launch — multi-agent: all tasks of the wave in ONE message

One `Agent` call per task: `subagent_type` = `implementer-backend` for `[backend]`,
`implementer-frontend` for `[frontend]`. Prompt (nothing else — the plan is the context):

```
plan: plans/<feature>.md
task: T<n>
base: <git rev-parse --short HEAD>
Other tasks of this wave run in parallel in the same checkout: <T…> (their files are not yours).
```

Wait for every report. Don't start the next wave early.

## 2b. Single-agent: do the wave's tasks yourself, one by one

No `Agent` calls. For each task in the order of the Waves table (`Runs` column), apply the implementers'
rules (`.claude/skills/implementer-protocol/SKILL.md` §2–§4): write only the task's Files; Contracts
are fixed; the task's Insights are binding; tests listed in Files are part of the task; run its Verify
before moving on. A task you can't finish within the plan → treat it as `BLOCKED` (step 5). Then the
gate (step 4) runs once per wave, exactly as in multi-agent mode; note insight candidates as you go.

## 3. Read reports (multi-agent)

Per task: `DONE` / `DONE_WITH_CONCERNS` / `BLOCKED`. Collect `DEVIATIONS`, `FOREIGN ERRORS`,
`BLOCKER`, `INSIGHT CANDIDATES`. A report without the required fields counts as `DONE_WITH_CONCERNS`.

## 4. Gate

1. **Ownership diff:** `git status --porcelain` minus the baseline. Every changed path must be in the
   ownership map under a task of this wave (generated migration files count for the migration task).
   Anything else → name the file + the task that likely touched it; revert only with the user's OK.
2. **Verify:** run every command in the Verify field of every task of the wave.
3. **Package checks** for each package the wave touched: typecheck; `server/` →
   `node scripts/check-architecture.mjs`; `reviewer-core/` → also server unit tests.
4. Record actual results (command → result) — you will show them in the wave summary.

## 5. Fix or stop

- All green and no BLOCKED → step 6.
- Red gate in ONE task's files → re-launch that task's implementer once with the failing output appended
  to the prompt (`gate failure:` + the exact errors); single-agent: fix it yourself once. Still red →
  mark it `blocked` and stop.
- Trivial cross-task glue (a missing export/import between two tasks' files) → you may fix it yourself,
  and say so in the summary.
- `BLOCKED` → mark the task `blocked: <reason>`, do NOT run later waves, show the user the `BLOCKER` and
  the smallest plan change; after the user decides, update the plan (or re-run the implementation-planner)
  and resume.

## 6. Record

- Each task's `Status:` line → `done` or `blocked: <one-line reason>`. Edit only those lines.
- Wave summary to the user: tasks + status, gate results, deviations, files you fixed yourself.
- Insight candidates: run the `engineering-insights` skill with them (it dedups and decides; implementers
  never write INSIGHTS themselves).
- Next wave → back to step 1, unless `--wave`/`--task` was given or the user asked to pause between waves.

## 7. Finish

All tasks `done` → run the full unit suites of every touched package once. Insights (§6) are already
recorded, so the verifiers and `/pr-self-review` see the final `INSIGHTS.md`. Then launch, in ONE
message, two `Agent` calls (read-only; their rules live in `.claude/agents/`):

```
subagent_type: plan-verifier           →  plan: plans/<feature>.md · base: <plan base> · run: unit
subagent_type: architecture-reviewer   →  base: <plan base> · plan: plans/<feature>.md
```

Show the user both header blocks (`VERDICT`, `COVERAGE` / `CHECKS RUN`, and every non-MET row / finding). Then:

plan-verifier finds the spec criteria through the plan's `Specs:` and each task's `Covers:` and returns
a TRACEABILITY matrix (`SPEC-NN/AC-n → task → test → commit`) with a GAPS list — show the GAPS too.

- `COMPLIANT` + `PASS` → plan `Status: done`, update its line in `plans/README.md`; set each linked
  spec's header `Status: approved` → `implemented` (edit only that word). Offer `doc-writer`
  (`from: plans/<feature>.md`) as an optional next step, then tell the user to run `/pr-self-review`
  (manual, it gates push/PR).
- `NOT COMPLIANT` or `FAIL` → keep `Status: in progress`, list the findings with their task, and offer a
  `--task T<n>` re-run with the finding appended as `gate failure:` — or ask the user. Never set `done`.
- `INCOMPLETE EVIDENCE` (+ `PASS`) → show `NOT RUN` / `UNVERIFIABLE` rows and ask the user to confirm
  the manual checks; set `done` only after they confirm.

Never commit, push or open a PR unless the user asks.
