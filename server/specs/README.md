# specs — server

Written feature specs for the `server` package, read before implementing one.
Linked from `server/CLAUDE.md` › *Read when*.

- **[`review-flow.md`](review-flow.md)** — the review cycle end to end: the
  module's endpoints, round/run creation, what one run does, the invariants a
  change must not break, and how the PR list's derived columns are computed.
- **[`skills.md`](skills.md)** — skills: the invariants (S1–S10), the data
  model, the API surface, and the import parsing rules.
- **[`conventions.md`](conventions.md)** — the Conventions Extractor: the
  invariants (C1–C10), the data model, the API surface, and how it produces
  a skill.
- **[`intent.md`](intent.md)** — the Intent Layer: the invariants (I1–I11),
  the web-fetch SSRF policy, the data model, the API surface, and how intent
  reaches the reviewer prompt.
