# specs — reviewer-core

Specs / acceptance criteria for the `reviewer-core` package.

Features of THIS module only, one per file: `<feature>.md` — a feature touching ≥ 2 modules has ONE spec in
the root [`specs/`](../../specs/README.md) and a `- see also: ../../specs/<feature>.md` line in the list below. Written BEFORE implementation by the
[`spec-creator`](../../.claude/agents/spec-creator.md) agent from its template (Spec ID `SPEC-NN`, unique across the
repo; EARS acceptance criteria `AC-n`, referenced as `SPEC-NN/AC-n`; no implementation details). Lifecycle:
`draft` → user sets `approved` → `implemented` (by `/implement-plan`). Only an approved spec without
`[NEEDS CLARIFICATION]` can be planned (`implementation-planner`). Specs written before 2026-11-08 have no Spec ID.
`docs/` describes how existing code works, `specs/` what to build.
Add each new spec to the list below with a one-line "read when".

<!-- - [feature.md](feature.md) — read when … -->
- [review-engine.md](review-engine.md) — read when changing `reviewPullRequest` inputs/outputs, grounding, scoring, map-reduce or callbacks (current-behavior contract, written after the code)
- see also: [../../specs/project-context-agent-tab-and-trace.md](../../specs/project-context-agent-tab-and-trace.md) — SPEC-04 · new `## Project context` section form (untrusted note + `### <path>` per wrapped doc), byte-identical prompt without docs
- Run Cost Badge (`onUsage` per-chunk callback) is specced in [../../server/specs/run-cost-badge.md](../../server/specs/run-cost-badge.md) — read when touching usage/cost reporting in `review/run.ts`
