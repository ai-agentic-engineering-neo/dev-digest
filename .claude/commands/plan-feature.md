---
description: Plan a spec with the implementation-planner agent and save the plan to docs/plans/
argument-hint: <path to the approved spec>
---

Plan the implementation of the spec at `$ARGUMENTS`.

1. Launch `implementation-planner` with the spec path (and any extra context
   the user gave). It returns a Phase 1 requirements review and stops.
2. Put every question from "Questions for the user" to the user with
   `AskUserQuestion`, including the execution-mode question. Show the
   recommendations so the user can accept or reject each one. Never answer
   on the user's behalf.
3. Resume the planner with `SendMessage`: the answers, the accepted and
   rejected recommendations, and the user's chosen mode.
4. Check the plan's Coverage table: every AC-N and NFR-N from the spec must be
   there, mapped to a step or `deferred`. If one is missing, send it back to
   the planner.
5. Save the plan verbatim to `docs/plans/<spec file name>` (same date and
   slug), and set the spec's `Plan:` line to that path.
6. Tell the user to start the build in a fresh chat with
   `/implement-plan docs/plans/<file>`.
