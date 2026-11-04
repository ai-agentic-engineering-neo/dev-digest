# specs — reviewer-core

Specs / acceptance criteria for the `reviewer-core` package.

One feature per file: `<feature>.md` with sections **Goal · Scope · Acceptance criteria**.
Written BEFORE implementation; `docs/` describes how existing code works, `specs/` what to build.
Add each new spec to the list below with a one-line "read when".

<!-- - [feature.md](feature.md) — read when … -->
- [review-engine.md](review-engine.md) — read when changing `reviewPullRequest` inputs/outputs, grounding, scoring, map-reduce or callbacks (current-behavior contract, written after the code)
- Run Cost Badge (`onUsage` per-chunk callback) is specced in [../../server/specs/run-cost-badge.md](../../server/specs/run-cost-badge.md) — read when touching usage/cost reporting in `review/run.ts`
