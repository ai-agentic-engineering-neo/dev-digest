# Docs — repository

Cross-cutting deep dives: material that belongs to no single package, or that
explains **why** something is built the way it is.

## Contents

- [`agent-prompts/`](agent-prompts/) — system prompts for the built-in reviewer
  agents, plus [choosing a model](agent-prompts/choosing-a-model.md).
- `design/` — UI prototypes and visual references.

## Rules

- `README.md` stays the map; the long explanation belongs here.
- One topic per file, kebab-case filename, a title line stating the topic.
- Link every doc from `../AGENTS.md` under `## Read when`, together with the
  trigger that should make someone open it — an unlinked doc is an unread doc.
- Architecture diagrams live here or in `README.md`, never in `AGENTS.md` / `CLAUDE.md`.
- Package-specific material goes to that package's `docs/`, not here.

Not here: work specs (`../specs/`), lessons learned (`../INSIGHTS.md`), testing
strategy (`../TESTING.md`).
