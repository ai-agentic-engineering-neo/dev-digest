# specs — server

Specs / acceptance criteria for the `server` package. 

One feature per file: `<feature>.md`, written BEFORE implementation by the
[`spec-creator`](../../.claude/agents/spec-creator.md) agent from its template (Spec ID `SPEC-NN`, unique across the
repo; EARS acceptance criteria `AC-n`, referenced as `SPEC-NN/AC-n`; no implementation details). Lifecycle:
`draft` → user sets `approved` → `implemented` (by `/implement-plan`). Only an approved spec without
`[NEEDS CLARIFICATION]` can be planned (`implementation-planner`). Specs written before 2026-11-08 have no Spec ID.
`docs/` describes how existing code works, `specs/` what to build.
Add each new spec to the list below with a one-line "read when".

<!-- - [feature.md](feature.md) — read when … -->
- [run-cost-badge.md](run-cost-badge.md) — read when persisting/exposing agent-run cost (`agent_runs.cost_usd`, PR-list cost sum, partial cost on failed runs)
- [pr-list-findings.md](pr-list-findings.md) — read when changing what `GET /repos/:id/pulls` returns about findings (`PrMeta.findings`, `topFindings`)
- [skills.md](skills.md) — read when touching skills (CRUD, import/zip parsing, agent links, how skills reach the prompt, seed agents)
- [multi-agent-review.md](multi-agent-review.md) — read when touching per-agent run estimates (`GET /agents/run-estimates`, averages over recent done runs)
- [conventions.md](conventions.md) — read when touching the Conventions Extractor (sampling, the extraction model call, evidence grounding, `conventions` table, skill from conventions)
- [intent-layer.md](intent-layer.md) — read when touching PR intent derivation (sources, linked issues/plans, `review_intent` model call, `pr_intent` caching, `/pulls/:id/intent` routes, intent section in the review prompt)
