# Specs — repository

Cross-cutting specs: work that spans more than one package (a course lesson that
adds a server module *and* a screen, a contract change, a new pipeline stage).
Work contained in a single package gets a spec in that package's `specs/` instead.

- Name a spec `<feature-slug>.md`. Keep it while the work is open; when it lands,
  either delete it or fold what it taught into `../docs/`.
- Suggested sections: **Goal · Non-goals · Behaviour and acceptance criteria ·
  Affected packages and files · Open questions**.
- A spec states intent, not implementation steps, and is never a changelog.
- Read the spec before the first edit, not after. If the code contradicts the spec,
  stop and resolve the contradiction — do not silently follow the code.
- Name every package the work touches: the packages are independent, and a contract
  change has to land in each copy in the same commit.

## Open specs

- [`findings-by-severity.md`](findings-by-severity.md) — severity counters and the
  findings filter (server + client).
- [`run-cost.md`](run-cost.md) / [`run-cost-plan.md`](run-cost-plan.md) — run cost on
  the PR list, the run timeline and the trace drawer.
- [`skills.md`](skills.md) — reusable skills: storage, editor, agent binding, import
  (server + client), plus
  [`skills-control-experiment.md`](skills-control-experiment.md) — the with/without
  procedure, and [`fixtures/`](fixtures/) — the archive used to demo the import.
- [`conventions-extractor.md`](conventions-extractor.md) — scan a repo for house
  conventions, verify the evidence in code, accept/reject/edit, build a
  `repo-conventions` skill (server + client).
- [`api-contract-reviewer.md`](api-contract-reviewer.md) — the second agent of
  homework 2: four contract skills (texts in
  [`fixtures/api-contract-reviewer/`](fixtures/api-contract-reviewer/)) and the
  A/B experiment.
