# docs/retro/ — workflow-orchestration retrospectives

Holds the output of the [`workflow-retro`](../../.claude/skills/workflow-retro/SKILL.md)
skill: a retrospective on how a multi-agent workflow run went — total tokens,
agent order, per-phase breakdown, handoff efficiency, and concrete
recommendations for future runs. This is orchestration performance, not code.

## How this differs from specs/, plans/, and LEARNINGS.md

- [`../../specs/`](../../specs/) — the *what and why* of a feature, written
  before code, by `spec-creator`.
- [`../../plans/`](../../plans/) — the *how*, written before code, by
  `implementation-planner`. `docs/retro/` entries are written *after* a run,
  about the run itself, never about a feature's requirements or approach.
- A module's `LEARNINGS.md` (e.g. `server/LEARNINGS.md`) — non-obvious
  *code/engineering* lessons, logged by `engineering-insights`. `docs/retro/`
  never writes there and never duplicates that content; a retro is about how
  the agents that did the work coordinated, not about what the code taught
  anyone.

## File naming

One file per retro'd run: `docs/retro/ledger/YYYY-MM-DD-<slug>.md`, written
with `Write` and never overwritten — a same-day collision on the same slug
gets `-2`, `-3`, etc. appended instead. There is no index file; `ls
docs/retro/ledger/` is the index.

## What a ledger entry must never contain

Ledger entries are committed and team-visible (`.gitignore` does not exclude
`docs/**`). They must never contain raw transcript dumps, verbatim prompt
text, secrets, or pasted file contents — only numbers, short quotes, and file
paths. See `workflow-retro/SKILL.md`'s "What this skill must not do" section
for the full list of prohibitions this rule is drawn from.
