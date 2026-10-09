# workflow-retro — design rationale

A retrospective on how a multi-agent workflow run went — orchestration
performance, not code lessons. Produces both a chat summary and a persisted
ledger entry under `docs/retro/ledger/`.

## Why base mode is inline and only deep mode forks

Two harness constraints, both cited in the plan this skill was built from
(`plans/01-workflow-retro.md`, "Architectural constraints"):

- **A subagent dispatch starts cold.** The `Agent` tool's own documentation,
  restated at [`../../agents/README.md`](../../agents/README.md), says a
  subagent without `fork` has no memory of the conversation that invoked it.
  This skill's primary data source is the *current conversation's own*
  history of `Agent`/`SendMessage` calls — that data simply does not exist
  inside a freshly dispatched subagent. So base mode cannot be "runs in a
  subagent and returns a result"; it has to be plain instructions the
  orchestrating agent follows in its own context, the same shape as
  `../implement-plan/SKILL.md` and `../engineering-insights/SKILL.md`.
- **Raw subagent transcripts must never be read inline.** The `Agent` tool
  warns that the JSONL transcript path it returns must never be `Read` or
  tailed — doing so overflows the calling context. Deep mode's job is
  specifically to read transcripts more closely than the in-context timeline
  allows, so *that* work has to be delegated to a subagent that extracts
  fields with `Bash` (`jq`/`grep`) and returns a bounded digest, never a
  `Read` of the file whole.

Put together: the two modes fork for opposite reasons. Base mode stays
inline because forking would lose its data source. Deep mode forks because
staying inline would blow the budget its data source requires.

## Why per-run ledger files, not one append-only ledger (D2)

Contrast this directly with `engineering-insights`'s own discipline, because
it was tempting to copy and deliberately wasn't:

`engineering-insights` treats `LEARNINGS.md` as one long-lived, shared file
per module — every session appends to the same document, so it mandates
`Edit`-only, anchor-on-a-known-heading, and reading the whole file first
before writing (`../engineering-insights/SKILL.md`,
`../engineering-insights/examples.md`). That discipline exists because a
stray `Write` to a shared file destroys every other session's entries.

A retro doesn't have that shape. Each retro is a self-contained document —
a timeline, a per-phase token table, signals, recommendations — for one
specific run. Nothing else needs to write into the *same* file. So:

- `Write` carries no clobber risk here, because each ledger file has a
  unique, generated name (`YYYY-MM-DD-<slug>.md`) — there's no shared
  anchor to get wrong.
- Folding every retro into one growing file would mean every future retro
  has to read the whole thing first before writing its own — exactly the
  per-run token cost this skill exists to measure and reduce. That would be
  self-defeating.
- The one thing a single shared file buys cheaply — cross-run trend — is
  recovered without one: Step 4 lists `docs/retro/ledger/` and reads the
  Recommendations section of the two most recent entries, marking repeats
  `RECURRING (Nth run)`. No hand-maintained index file; `ls` is the index,
  and an index file is one more artifact that can silently drift from
  reality.

## Why manual-only

Stated twice, independently, by the product owner. There is no "run
automatically at the end of a session" mode, and the skill's own "must not
do" section forbids adding one. This mirrors `../implement-plan/SKILL.md`
and `../engineering-insights/SKILL.md`, both of which are also
explicit-invocation only.

## Why this is distinct from engineering-insights

`engineering-insights` answers "what code/engineering lesson did we learn,
and which module owns it" — output goes to that module's `LEARNINGS.md`.
`workflow-retro` answers "how well did the agents that did the work
coordinate" — tokens, order, handoffs, rework — and never touches a
`LEARNINGS.md`. A session can produce both kinds of output and neither
substitutes for the other; a code lesson belongs where future code sessions
will look for it, an orchestration lesson belongs where a future *workflow*
run will look for it.

## Not built yet / open questions

- **Unproven on a real run.** This skill has not yet been exercised against
  an actual multi-agent session; the shapes above are design, not measured
  behavior. Treat the first several real invocations as validating the
  design as much as producing a retro.
- **Deep mode's transcript path is machine-local.** The fallback path under
  `~/.claude/projects/<cwd-slug>/*.jsonl` is not portable across machines
  and may prompt for permission — the skill degrades to base mode rather
  than fail when it isn't usable, but that degrade path is also untested.
- **The recurring-recommendation lookback depth (2 entries) is a guess**,
  not a measured number. It may need to be deeper once there's a real
  history of ledger entries to look back across.
