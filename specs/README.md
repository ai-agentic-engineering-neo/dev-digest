# specs/ — feature specifications

One file per feature, written **before** the implementation: what changes,
why, and how you'll know it works. Specs start being used around lessons
L03/L05; the folder is created now so `CLAUDE.md` pointers resolve.

Not to be confused with [`../e2e/specs/`](../e2e/specs/), which holds
`*.flow.json` browser-flow definitions — a different thing entirely.

## This folder is for cross-module specs only

A feature that touches two or more modules (server/client/reviewer-core/
e2e/mcp-server) gets its spec here, at the root. A feature that touches
exactly one module gets its spec in that module's own `specs/` folder
instead (e.g. `../server/specs/03-foo.md`) — created on demand, same naming
and shape rules as here. `spec-creator` decides which location applies per
feature; see [`.claude/agents/spec-creator.md`](../.claude/agents/spec-creator.md).

Numbering is sequential **per folder** — root `specs/` and each module's
`specs/` keep independent counts, not a shared global sequence.

## Naming

`NN-short-slug.md`, numbered in the order specs are written within that
folder (`01-run-cost-badge.md`, `02-severity-filter.md`, …). The number is a
chronological id, not a priority.

## Shape

Specs written by `spec-creator` (from spec `09` on) use this shape — a
feature-spec answers *what and why*, never *how*; that's the plan's job:

```md
# Spec: <feature>   |   Spec ID: SPEC-NN   |   Status: draft|approved|implemented
Supersedes: <link, only if this replaces an older spec's decision>

## Problem & Motivation
## Goals / Non-goals
## User stories
## Acceptance criteria (EARS)
## Edge cases
## Non-functional
## Inputs (provenance)
## Untrusted inputs
## [NEEDS CLARIFICATION: …]
```

Acceptance criteria are written in [EARS syntax](https://en.wikipedia.org/wiki/Easy_Approach_to_Requirements_Syntax)
and each gets an id (`AC-1`, `AC-2`, …) so `implementation-planner` and
`plan-verifier` can reference them directly. Open questions the author
couldn't resolve go in `[NEEDS CLARIFICATION: …]` rather than being guessed
at. Full authoring rules live in
[`.claude/agents/spec-creator.md`](../.claude/agents/spec-creator.md).

Specs `01`–`08` predate this shape and use the older
`Context / Scope / Approach / Verification` format below — left as-is, not
retroactively migrated:

```md
# <Feature>

## Context
What problem this solves and what prompted it.

## Scope
What changes — the packages, the user-visible surface. And explicitly:
what is *not* in scope.

## Approach
The chosen design, and the files it touches. Reference existing helpers
rather than inventing new ones.

## Verification
How to prove it works end to end: tests to run, what to click, what the
numbers should look like.
```

`implementation-planner` writes a separate plan into the top-level
[`../plans/`](../plans/) folder, not into `specs/` — see
[`plans/README.md`](../plans/README.md) for its shape. A spec is the *what*,
a plan is the *how*, and they live in two different folders on purpose.

## Why root, not per-module, for cross-module features

A cross-module feature almost always crosses packages — a server route plus
the client that renders it. Keeping one spec per feature at the root avoids
splitting the same spec across `server/` and `client/`. Module-local specs
still belong to that module for the same reason a single-module feature's
implementation does; module-local *lessons* belong in that module's
`LEARNINGS.md` either way.
