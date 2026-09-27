# Docs — e2e

Deep-dive documents: how a subsystem works and **why** it is built that way,
written for a reader who already knows what this package does.

- `README.md` stays the map; the long explanation belongs here.
- One topic per file, kebab-case filename, a title line stating the topic.
- Link every doc from `../AGENTS.md` under `## Read when`, together with the
  trigger that should make someone open it — an unlinked doc is an unread doc.
- Architecture diagrams live here or in `README.md`, never in `AGENTS.md` / `CLAUDE.md`.

Not here: work specs (`../specs/`), lessons learned (`../INSIGHTS.md`), or anything
already covered by `../README.md`.

## Contents

- [`seeded-fixtures.md`](seeded-fixtures.md) — exactly what `db:seed` creates, so a
  new flow asserts on data that exists (there is no `SUGGESTION` finding, no run,
  no cost).
