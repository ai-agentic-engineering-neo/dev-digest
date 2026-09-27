# Docs — client

Deep-dive documents: how a subsystem works and **why** it is built that way,
written for a reader who already knows what this package does.

- `README.md` stays the map; the long explanation belongs here.
- One topic per file, kebab-case filename, a title line stating the topic.
- Link every doc from `../CLAUDE.md` under `## Read when`, together with the
  trigger that should make someone open it — an unlinked doc is an unread doc.
- Architecture diagrams live here or in `README.md`, never in `CLAUDE.md`.

Not here: work specs (`../specs/`), lessons learned (`../INSIGHTS.md`), or anything
already covered by `../README.md`.

## Contents

- [`findings-surfaces.md`](findings-surfaces.md) — the four screens that render
  findings, which data source each reads, and why the severity pills are counted
  after the confidence filter.
- [`skills-ui.md`](skills-ui.md) — why `/skills` is one route with query-string
  state, which tabs exist (and which of the design's tabs deliberately do not),
  and the two-step import.
