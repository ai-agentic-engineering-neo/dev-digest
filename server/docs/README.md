# Docs — server

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

- [`pr-list-read-model.md`](pr-list-read-model.md) — how `GET /repos/:id/pulls`
  composes SCORE, COST and FINDINGS: one IN-query per column, and why "latest"
  for two of them and "total" for the third.
- [`skills-in-prompt.md`](skills-in-prompt.md) — the path from `agent_skills` to
  the model: the two SQL gates, the labelled block, and why skills are NOT
  wrapped as untrusted data.
