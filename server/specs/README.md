# Specs — server

One file per unit of work: what we intend to build, written **before** we build it.

- Name a spec `<feature-slug>.md`. Keep it while the work is open; when it lands,
  either delete it or fold what it taught into `../docs/`.
- Suggested sections: **Goal · Non-goals · Behaviour and acceptance criteria ·
  Affected files · Open questions**.
- A spec states intent, not implementation steps, and is never a changelog.
- Read the spec before the first edit, not after. If the code contradicts the spec,
  stop and resolve the contradiction — do not silently follow the code.
- Link a spec from `../CLAUDE.md` only while it is the active piece of work.

## Open specs

- [`pr-list-findings-summary.md`](pr-list-findings-summary.md) — the severity
  breakdown + previews that `GET /repos/:id/pulls` returns per PR.
- [`skills-module.md`](skills-module.md) — the skills module: CRUD, versions, the
  import extractor, and the port a review run reads skills through.
