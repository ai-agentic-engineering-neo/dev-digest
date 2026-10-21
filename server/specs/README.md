# server — specs

Feature specs for this package. One file per feature, named
`<feature>.md`. Course lessons (L01–L08) land their specs here.

Suggested sections: Goal · Scope (in / out) · API or UI changes ·
Data model changes · Acceptance criteria · Open questions.

## Index

- [`review-flow.md`](review-flow.md) — behavioural contract of a review run: trigger, run rows, background execution, persistence, SSE, read routes, cancel and delete semantics, failure states, as numbered invariants with the enforcing symbol.
- [`run-cost-badge.md`](run-cost-badge.md) — L01 Run Cost Badge: cost + tokens per run on the PR list, timeline, run drawer, and review runs (implemented 2026-09-25, both halves).
- [`skills.md`](skills.md) — L02 Skills: data model, `/skills` API with body versioning, agent link validation + versioning, `.md`/`.zip` import parser, prompt/trace contract, seeded agents and skills (implemented 2026-09-25; HW2 added versions, diff, restore, agent_count, per-skill trace blocks).
- [`conventions.md`](conventions.md) — HW2 Conventions Extractor: scans + candidates tables, extract job (samples in code, one structured LLM call, evidence verification), accept/reject/edit, `repo-conventions` skill creation and agent link (implemented 2026-09-26).
- [`project-context.md`](project-context.md) — Project context (SPEC-01): `agent_context_docs` / `skill_context_docs`, `GET /repos/:id/context[/file]`, `GET|PUT /agents|skills/:id/context`, base-branch reads, token caps, `context_blocks` in the trace; local overrides of documents (`context_doc_overrides`, `PUT|DELETE /repos/:id/context/file`, `modified` on the listing, the file read and trace blocks) (implemented 2026-10-20, overrides 2026-10-21; UI half in `client/specs/project-context.md`).
- [`pr-brief.md`](pr-brief.md) — PR Brief (SPEC-03): `GET /pulls/:id/brief`, `POST /pulls/:id/brief/generate`, `agent_runs.kind` and the `pr_brief` columns (migration 0017), the one-call rule, reference verification, stale rule, `kind` filters, trace shape, and the cross-model review of the plan (implemented 2026-10-21; UI half in `client/specs/pr-brief.md`).
- [`smart-diff.md`](smart-diff.md) — Smart Diff: `GET /pulls/:id/smart-diff`, the five-role path classifier and its precedence, latest-review-per-agent finding selection, `finding_lines` vs `finding_ids`, split suggestion, no model call (implemented 2026-10-06; UI half in `client/specs/pages.md`).
