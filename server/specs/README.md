# server/specs

One file per feature or task brief: goal, scope, acceptance criteria, and
decisions. Name them `NN-short-name.md`. Link from here, not from CLAUDE.md,
so specs load only when relevant.

## Index
- [01 — Run Cost Badge](01-run-cost-badge.md): persist per-run cost, show it in the PR list, timeline, trace drawer and verdict banner.
- [02 — Skills](02-skills.md): reusable skills attached to agents, import preview, prompt injection, trace token accounting, Test Quality Reviewer.
- [03 — Conventions Extractor](03-conventions.md): scan a repo for house conventions, ground each in code, accept/edit, build one skill; API Contract Reviewer agent + skills.
