---
name: implementer-protocol
description: Internal working protocol injected into the implementer-backend and implementer-frontend subagents via their `skills:` list — input contract, file ownership, fixed contracts, how to read INSIGHTS by path, code-first work loop and the report format for ONE task of a plans/<feature>.md Development Plan. Not for the main session; to execute a plan use /implement-plan.
metadata:
  version: "1.0.0"
  updated: "2026-11-06"
---

# Implementer protocol

You implement **ONE task** of a Development Plan. Other implementers work in the same checkout at the
same time on other tasks of the same wave. Your agent file adds your skill table and package scope.

## 0. Precedence over CLAUDE.md

The root `CLAUDE.md` "Session protocol" (name insights in the first reply, run `engineering-insights` at
the end) is written for the main session and **does not apply to you**: you never write any
`INSIGHTS.md` (parallel writes collide) and you have no `Skill` tool. Return insights in the report
(`INSIGHT CANDIDATES`); the caller records them. Everything else in `CLAUDE.md` applies.

## 1. Input and preconditions

The prompt gives `plan: plans/<feature>.md` and `task: T<n>`. Return `BLOCKED` with the reason if:
- either is missing, the file does not exist, or the task ID is not in it;
- the plan `Status` is not `approved` / `in progress`, or the task `Status` is `done`;
- the task type is not yours (`[backend]` vs `[frontend]`);
- any skill from your agent's table is missing from your context (Claude Code skips a missing skill
  silently) → `BLOCKED: skill <name> not injected`.

## 2. Before coding

1. From the plan read only: Global constraints, Contracts, File ownership map, and YOUR task.
2. Read the `CLAUDE.md` of your task's package (`server/`, `client/`, `reviewer-core/` or `e2e/`).
3. **INSIGHTS by path** (don't read the whole file):
   - the task's **Insights** field — entries the implementation-planner attached; they are binding;
   - `Grep` the package's `INSIGHTS.md` for the folders/modules of your owned files (e.g.
     `modules/skills`, `app/skills`, `hooks/skills`, `run-executor`) — entries carry `path:line → symbol`;
   - read the sections **What Doesn't Work** and **Recurring Errors & Fixes** in full (tooling traps).
   - An entry `CORRECTION of <date> entry` overrides the older one — follow the newest.
4. Open every file you own and its direct neighbours (the module / route you extend) and copy their
   conventions.

## 3. Hard rules

1. **File ownership.** Create/modify ONLY the files listed in your task. Needing any other file (even a
   one-line export or one i18n key) → stop and return `BLOCKED` naming the file and why. The caller diffs
   the working tree against the ownership map after the wave.
2. **Contracts are fixed.** Implement/consume the Contracts exactly. If one is wrong, return `BLOCKED` —
   never change a shape another task uses.
3. **Do not touch** (root `CLAUDE.md`): `*/src/vendor/shared/**`, `server/src/db/migrations/**` (only
   generated, and only if your task says so), `server/clones/**`, `.claude/**`, lockfiles,
   `*/INSIGHTS.md`, `plans/**`. No `pnpm install` / `npm install`, no `git add/commit/push/checkout/
   reset/stash`, no `docker compose down -v`.
4. **No scope creep.** No refactors, renames or "while I'm here" fixes outside the task — list them under
   `DEVIATIONS` instead.

## 4. Work loop — write the code

Your job is to **write the code**. Verification happens after the wave (the caller runs every task's
Verify + typecheck; the user runs `/pr-self-review`) — don't spend turns auditing yourself.

1. Implement the task, applying every skill from your agent's table while you write. Write tests only if
   the task's Files list contains test files.
2. Optional: run the existing tests for the code you touched (the task's **Verify** commands are the
   reference; on Windows call bins via `node node_modules/...`). A failure in YOUR files → fix it, but
   don't loop: after one fix attempt report it and stop. Errors in files you don't own (another
   implementer is editing them right now) → list under `FOREIGN ERRORS`, don't touch.
3. Quick re-read of your own code for coding mistakes only (typos, wrong imports, unhandled branch).

## 5. Report — your final message (the caller sees only this)

```
STATUS: DONE | DONE_WITH_CONCERNS | BLOCKED
TASK: T<n> — <title>
FILES: <path> (new|modified), …
TESTS: <command> → <actual result>, or "not run"
DEVIATIONS: <anything differing from the plan, or "none">
FOREIGN ERRORS: <errors in files you don't own, or "none">
BLOCKER: <only if BLOCKED: what is missing and the smallest plan change that would unblock it>
INSIGHT CANDIDATES: <non-obvious, confirmed facts for INSIGHTS.md, with path:line → symbol — or "none">
```
