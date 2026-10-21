# e2e — docs

Design notes for this package: how a subsystem works, why it was built this
way, and what alternatives were rejected. One Markdown file per topic.

Repo-wide docs (e.g. agent-prompt guidance) live in `../../docs/`.

What goes where:

- `README.md` (package root) — overview, diagrams, commands.
- `docs/` (here) — deeper design notes and decisions.
- `specs/` — feature specs written before or alongside a change.
- `INSIGHTS.md` — short non-obvious learnings and gotchas.

## Index

- [`runner.md`](runner.md): how `run.ts` executes a flow (child process per command, failure screenshots, exit codes), the allowed command families, and the hermetic `scripts/e2e.sh` stack versus the CI workflow.
