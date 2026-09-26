# server — specs

Feature specs for this package. One file per feature, named
`<feature>.md`. Course lessons (L01–L08) land their specs here.

Suggested sections: Goal · Scope (in / out) · API or UI changes ·
Data model changes · Acceptance criteria · Open questions.

## Index

- [`review-flow.md`](review-flow.md) — behavioural contract of a review run: trigger, run rows, background execution, persistence, SSE, read routes, cancel and delete semantics, failure states, as numbered invariants with the enforcing symbol.
- [`run-cost-badge.md`](run-cost-badge.md) — L01 Run Cost Badge: cost + tokens per run on the PR list, timeline, run drawer, and review runs (implemented 2026-09-25, both halves).
- [`skills.md`](skills.md) — L02 Skills: data model, `/skills` API with body versioning, agent link validation + versioning, `.md`/`.zip` import parser, prompt/trace contract, seeded agents and skills (implemented 2026-09-25).
