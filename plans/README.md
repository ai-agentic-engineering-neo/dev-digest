# plans/ — implementation plans

One file per feature: the *how*, written after the *what and why* (a
`specs/NN-slug.md` written by `spec-creator`) or, for changes small enough to
skip that step, after a short direct clarification. Written before the code.

Not to be confused with [`../specs/`](../specs/) (the requirements — problem,
goals, EARS acceptance criteria) or [`../e2e/specs/`](../e2e/specs/)
(`*.flow.json` browser-flow definitions — unrelated to either).

## Naming

`NN-short-slug.md`, numbered in the order plans are written. When a plan
implements an existing spec, reuse that spec's slug so the pair lines up
(`specs/07-blast-radius.md` ↔ `plans/07-blast-radius.md`); the numbers don't
have to match if the plan was written standalone, with no paired spec.

## Shape

Written by the `implementation-planner` agent. Keep it short enough to read
before coding, concrete enough to execute:

```md
# <Feature> — Implementation Plan

## Source requirements
Either the specs/NN-slug.md this plan implements (with the AC-IDs it
covers), or — if no formal spec exists — a short summary of the
requirements as given and clarified directly.

## Clarifications & recommendations
Open questions asked and answered, plus `implementation-planner`'s own
recommendations on approach or scope — marked as recommendations, not
settled requirements.

## Execution mode
Single-agent pass or multi-agent (which agents, in what order): the
recommendation, and the choice actually made.

## Modules affected
Which of server / client / reviewer-core / e2e this touches, and why.

## Architectural constraints
Constraints pulled from each touched module's CLAUDE.md / LEARNINGS.md,
cited as `path:line` or by section heading — not paraphrased from memory.

## Approach
The chosen design and the files it touches. Reference existing helpers
(with `file:line`) rather than inventing new ones.

## Skills for implementer
Per file/module glob, which `.claude/skills/` entries the implementer must
load before touching those files, and why.

## Verification
Tests/typecheck commands to run per touched module, and what a passing
result looks like. Prefer commands scoped to the files/tests this plan
touches over the full suite — both `implementer` and `plan-verifier` run
this section, and `pr-self-review` re-runs the full suite once more right
before push regardless. Name the full suite only when the change is broad
enough that a scoped run wouldn't catch a regression it could cause.
```

## Why here and not per-module

Same rationale as [`specs/README.md`](../specs/README.md): a feature almost
always crosses packages, so one plan per feature beats the same plan split
across `server/` and `client/`. Module-local knowledge belongs in that
module's `LEARNINGS.md`.
