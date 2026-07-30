# specs/ — feature specifications

One file per feature, written **before** the implementation: what changes,
why, and how you'll know it works. Specs start being used around lessons
L03/L05; the folder is created now so `CLAUDE.md` pointers resolve.

Not to be confused with [`../e2e/specs/`](../e2e/specs/), which holds
`*.flow.json` browser-flow definitions — a different thing entirely.

## Naming

`NN-short-slug.md`, numbered in the order specs are written
(`01-run-cost-badge.md`, `02-severity-filter.md`, …). The number is a
chronological id, not a priority.

## Shape

Keep it short enough to read before coding, concrete enough to execute:

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

## Why here and not per-module

A feature almost always crosses packages — a server route plus the client
that renders it. Root-level keeps one spec per feature instead of the same
spec split across `server/` and `client/`. Module-local knowledge belongs in
that module's `LEARNINGS.md`.
