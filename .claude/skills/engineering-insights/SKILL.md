---
name: engineering-insights
description: "Reads and maintains this repo's per-package INSIGHTS.md knowledge files. Use at the start of any task that touches server, client, reviewer-core or e2e — read that package's INSIGHTS.md before answering — and again when a task ends, to append non-obvious findings (traps, dead ends, conventions, dependency quirks) as dated append-only entries. Also use when the user mentions insights, learnings, wrap-up or retrospective, asks what was learned, or asks to prune the insight files."
---

# Engineering Insights

What one session learns is lost unless the next session reads it. This skill owns
both halves of that loop: read `INSIGHTS.md` before working, append to it after.

## Modes

| Mode | Trigger | Outcome |
|---|---|---|
| `read` | first step of any task on this repo | the relevant `INSIGHTS.md` files are read and summarized before any code is read |
| `capture` | a task or session ends | qualifying findings are appended; nothing is written when nothing qualifies |
| `review` | the user asks to prune, merge or audit entries | duplicates merged, stale entries superseded |

`capture` covers the current task by default. Widen it to the whole session only
when the user asks for a session wrap-up or a retrospective.

## Where entries go

| Work touched | File |
|---|---|
| `server/**` | `server/INSIGHTS.md` |
| `client/**` | `client/INSIGHTS.md` |
| `reviewer-core/**` | `reviewer-core/INSIGHTS.md` |
| `e2e/**` | `e2e/INSIGHTS.md` |
| `scripts/**`, `docker-compose.yml`, CI, cross-package contracts, stack-wide choices | `INSIGHTS.md` at the repo root |

Work spanning several packages: write the part that applies to each package in
that package's file. Never paste one entry into two files. Contract drift between
`server/src/vendor/shared` and `client/src/vendor/shared` belongs in the root file.

## Mode: read

1. Identify the package the request touches, using the routing table above.
2. Read that package's `INSIGHTS.md` in full, plus the root one. They are small.
3. State in one line what was read and which entries bear on this task — or that
   none do.

Do this before reading code and before answering. The one-line confirmation is
not a courtesy: it forces the file to be processed rather than skimmed, and it
shows the user the loop is actually running.

## Mode: capture

Copy this checklist and work through it:

```
Capture:
- [ ] 1. List candidates
- [ ] 2. Drop anything unverified
- [ ] 3. Run each candidate through the quality gate
- [ ] 4. Re-read the target INSIGHTS.md
- [ ] 5. Append survivors, or state that nothing qualified
```

**1. List candidates.** What cost time, what behaved differently than expected,
what decision was made and why.

**2. Drop anything unverified.** A fix no test or run has confirmed is a guess.
Guesses do not go in the file.

**3. Quality gate.** An entry is written only if every line below is true:

- Actionable cold: an agent reading it knows what to do without re-investigating.
- Backed by evidence: `file.ts:42`, a command, or the literal error text.
- Transferable: a rule that fires again, not the story of one fix.
- Specific to this repo, not general knowledge about the language or framework.
- Not obvious: if anyone reading the code would see it, do not write it.
- Not already stated in `CLAUDE.md`, `README.md`, `TESTING.md`, `docs/` or
  `specs/` — those are already in context, and a copy here is noise.
- Free of secrets, tokens, env values and user data. This file is committed.

**4. Re-read the target file.** If the insight is already there, write nothing and
say so. If an existing entry is now wrong, append a dated entry that supersedes it
and names its date. Never edit or delete the old one.

**5. Append.** Newest entry at the top of its section. When nothing survives the
gate, write nothing and say so in one line. Running the capture step is not
optional; writing an entry is.

## Mode: review

Only on explicit request. Merge duplicate entries into one, mark superseded
entries, and trim a file that has grown past roughly 30 entries. Report what
changed. Section headings stay intact.

## Sections

Every `INSIGHTS.md` carries these seven headings, in this order, never renamed and
never removed:

- **What Works** — approaches and solutions that held up here.
- **What Doesn't Work** — dead ends and antipatterns. The most frequently skipped
  section and the most valuable one: a session that hit a dead end and left this
  empty wasted the trap.
- **Codebase Patterns** — conventions and structural decisions.
- **Tool & Library Notes** — quirks of the pinned dependencies.
- **Recurring Errors & Fixes** — an error seen twice, plus the fix that worked.
- **Session Notes** — dated summary, only when a session changed how the package
  is worked on and it fits nowhere else. Usually empty.
- **Open Questions** — what was left unresolved, so the next session does not
  re-investigate blind.

## Entry format

One insight per bullet, dated, with the rule as an absolute directive:

```markdown
- **2026-09-19 — Body-less POST trips Fastify's empty-body guard.**
  `apiFetch` sets `content-type: application/json` only when a body is present;
  declaring it without one makes Fastify reject the request before the handler.
  Rule: NEVER hand-set that header — always go through `apiFetch`.
  `client/src/lib/api.ts:31`
```

Add `Confidence: low` as a final line only when the finding is a single
observation that has not been reproduced. High confidence is the default and is
left unannotated.

## File rules

- Append-only. Existing entries are never rewritten, reformatted or reordered.
- A correction is a new dated entry that supersedes the old one.
- One insight per bullet.
- Roughly 30 entries per file is the ceiling. Past it, a new entry requires
  merging or superseding an old one — in `review` mode, not mid-task.

## Reliability

A skill runs when the model judges it relevant; only a lifecycle hook runs because
an event happened. That is why the read step is also written into the root
`CLAUDE.md` instead of living here alone.

## Examples

Good and bad entries, one shape reference per package, a supersede example and a
merge example: see [examples.md](examples.md).
