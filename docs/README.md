# docs/ — cross-package

Reference material describing how the system works **today**, across more than one
package. Human-first prose and diagrams; agents read it on demand via the `Read when`
pointers in [`../CLAUDE.md`](../CLAUDE.md).

| Path             | What                                                           |
| ---------------- | -------------------------------------------------------------- |
| `agent-prompts/` | System prompts for the built-in reviewers + model-choice notes  |

Package-local reference material goes in `<package>/docs/` instead.

Rules:

- Do not restate `README.md`. Link to it.
- Intent for unbuilt work goes in `../specs/`; what we tried and rejected goes in
  `../insights.md`. Only "how it works today" belongs here.
- If a doc goes stale, delete it. A wrong doc costs more than a missing one, because
  `CLAUDE.md` points agents at it as curated truth.
