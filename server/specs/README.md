# specs — server

Specs / acceptance criteria for the `server` package. 

Features of THIS module only, one per file: `<feature>.md` — a feature touching ≥ 2 modules has ONE spec in
the root [`specs/`](../../specs/README.md) and a `- see also: ../../specs/<feature>.md` line in the list below. Written BEFORE implementation by the
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
- see also: [../../specs/project-context-folder.md](../../specs/project-context-folder.md) — SPEC-01 · repo doc discovery, per-(agent, repo) attachments, project-context section in review runs
- see also: [../../specs/onboarding-tour.md](../../specs/onboarding-tour.md) — SPEC-02 · per-repo Onboarding Tour generation (repo-intel facts + 1 LLM call, grounding, stale)
- see also: [../../specs/project-context-editable-docs.md](../../specs/project-context-editable-docs.md) — SPEC-03 · DevDigest-stored `.devdigest/specs/` docs (CRUD, upload, copy-to-edit, delete + detach, used in runs)
- see also: [../../specs/project-context-agent-tab-and-trace.md](../../specs/project-context-agent-tab-and-trace.md) — SPEC-04 · project-context section text, "Specs read" trace detail, token counting of the section
- see also: [../../specs/project-context-for-skills.md](../../specs/project-context-for-skills.md) — SPEC-05 · per-(skill, repo) doc attachments, inherited docs merged into runs (agent → skills, dedupe, one cap)
- [intent-layer.md](intent-layer.md) — read when touching PR intent derivation (sources, linked issues/plans, `review_intent` model call, `pr_intent` caching, `/pulls/:id/intent` routes, intent section in the review prompt)
