# reviewer-core — docs

Design notes for this package: how a subsystem works, why it was built this
way, and what alternatives were rejected. One Markdown file per topic.

Repo-wide docs (e.g. agent-prompt guidance) live in `../../docs/`.

What goes where:

- `README.md` (package root) — overview, diagrams, commands.
- `docs/` (here) — deeper design notes and decisions.
- `specs/` — feature specs written before or alongside a change.
- `INSIGHTS.md` — short non-obvious learnings and gotchas.

## Index

- [`pipeline.md`](./pipeline.md): how `reviewPullRequest` runs, stage by stage (prompt slots, injection guard, strategy selection, strict structured output, reduce and score weights, grounding gate, cost aggregation, `OpenRouterProvider`) and why each piece is shaped that way.
