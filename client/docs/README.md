# client — docs

Design notes for this package: how a subsystem works, why it was built this
way, and what alternatives were rejected. One Markdown file per topic.

Repo-wide docs (e.g. agent-prompt guidance) live in `../../docs/`.

What goes where:

- `README.md` (package root) — overview, diagrams, commands.
- `docs/` (here) — deeper design notes and decisions.
- `specs/` — feature specs written before or alongside a change.
- `INSIGHTS.md` — short non-obvious learnings and gotchas.

## Index

- [`ui-architecture.md`](ui-architecture.md) - how the UI is built: Server/Client boundary, provider stack and toast policy, hook → `apiFetch` → Fastify data flow, `_components/` convention, `@devdigest/ui` layers, contract copy rule, live SSE vs persisted trace, PR detail composition.
