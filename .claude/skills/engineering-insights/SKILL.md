---
name: engineering-insights
description: Records non-obvious findings about this repo in the INSIGHTS.md of the area they belong to — one per package, plus .claude/INSIGHTS.md for the agent setup — and reads back what earlier sessions recorded. Use this skill before the first edit of any coding task here, and again when wrapping one up. That includes a request that names no path because it continues earlier work — "carry on", "now do X", "check it", "fix that" — and a task resumed after the conversation was compacted. Also use it for work in server/, client/, reviewer-core/ or e2e/, for changes to a skill, a hook or a CLAUDE.md, after debugging, when something behaved unexpectedly, when a fix's cause was not obvious, or when the user mentions insights, learnings or lessons. Reading is part of the job even when the task looks simple. Skip it for renames, formatting and config tweaks that teach nothing.
allowed-tools: Read, Edit, Grep, Glob
---

# Engineering insights

Knowledge lives next to the thing it describes. Five files, one per area, no central one:

| Area | File |
|---|---|
| The four packages | `server/` · `client/` · `reviewer-core/` · `e2e/` → that package's `INSIGHTS.md` |
| The agent setup itself — skills, hooks, `CLAUDE.md` wiring, settings | `.claude/INSIGHTS.md` |

Pick by what the finding is *about*, not by where the file that revealed it happens to live. A
finding about how skills load belongs to the harness even when it surfaced while working in
`server/`.

## What earlier sessions recorded

!`cat */INSIGHTS.md .claude/INSIGHTS.md`

Everything above is already in context — it does not need to be read again. A file showing only
headings has nothing recorded in it yet.

Before touching a package, say which of these entries bear on the task at hand, or say that none do.
Naming them is what makes them usable; loading them silently is the same as not having them.
Treat them as high-confidence guidance until the code says otherwise — an entry contradicted by the
code is a finding in its own right.

## Whether to write at all

Writing nothing is a normal outcome, and by far the most common one. Say so out loud rather than
passing over the question in silence — a skipped check and an honest "nothing to record" look
identical afterwards, and only one of them is true.

A finding is a candidate only if it came from one of these, listed strongest first:

1. **A correction from the user** — the clearest evidence that what the agent believed and what is
   true had come apart
2. **An approach that failed** and should not be tried again
3. **A pattern that repeated** within the session
4. **An error whose cause was not obvious**
5. **A sequence of steps that turned out to be the working one**

"It seemed interesting" is not on the list. Name which one a candidate came from; if none fits,
there is nothing to record.

Then check it is about **this repository**. Behaviour of Claude Code, of pnpm, of a framework — true
in any project that uses them — is not a finding about this codebase, however hard-won. It has no
home here. The same goes for anything about code being actively rewritten right now: it will be
wrong within the week, and a confidently wrong entry costs more than a missing one.

**One or two entries per session. Three is a sign that most are restating the work rather than
distilling it.** Picking the strongest is the point — the scarce resource is the attention of
whoever reads this next, not room in the file.

## Is this file the right home

A finding that holds regardless of what anyone discovers next is a rule, not an observation, and
rules live where they will be read before acting:

| The finding | Where it goes |
|---|---|
| Something learned about how this codebase behaves | here, as an entry |
| A standing constraint — this must not be changed, and why | `Do not touch` in the root `CLAUDE.md` |
| How to work inside one package | that package's `CLAUDE.md` |
| Behaviour of a tool, identical in every repository | nowhere in this repo |

Routing it correctly matters more than recording it. An entry filed here that should have been a
rule gets read once, by someone who already had the problem.

## What to do with a finding

Check the entries above before writing anything. Four outcomes:

| The finding | What to do |
|---|---|
| Already recorded, nothing new | Nothing. This is the usual case |
| Already recorded, but now the cause, the boundary or the exact path is known | Extend that entry — its wording stays, yours is added to it |
| Contradicts an existing entry | New entry, naming the one it supersedes |
| Not there at all | Append it |

**Extending** leaves the existing sentence intact and adds to it, and carries both dates:
`**2026-09-18** (refined 2026-10-02) — …`. An entry written the same day needs no second date — two
identical dates say nothing. Only extend an entry whose evidence path you opened this session.
Removing or reversing a claim is not extending — that is the contradiction row, and it is served by
a new entry, leaving the old one readable.

Consolidating several entries into a principle, or clearing out stale ones, is a separate pass that
a person reviews — never something to do mid-task.

## Nothing already written is lost

These files are versioned and several people add to them, so a lost line is a lost lesson that
nobody notices. Three guarantees, in order of strength:

- **Whole-file replacement is impossible.** This skill is granted `Edit` and not `Write`, so it can
  only change text it has matched — it cannot hand back a new version of the file.
- **Only two operations are allowed:** adding a new entry under a heading, and appending words to
  the end of one existing entry. Nothing else is edited.
- **Never touched:** any other entry, any heading, the file's opening lines, and every file outside
  the one area this finding belongs to.

If a change cannot be made under those terms, it is not a change for this skill to make — say what
is needed and leave the file alone.

## Entry format

```
**YYYY-MM-DD** — the finding. Evidence: path:line.
```

Evidence is what makes an entry checkable later, and what makes staleness visible: when the path
no longer opens, the entry is suspect rather than true. A finding with nothing to cite is not ready
to be written down.

One finding per entry — two lessons on one line means neither gets found again.

## Which section

Seven fixed sections. Where more than one fits, resolve in this order:

| The finding is | Section |
|---|---|
| A reproducible failure with a known fix | Recurring Errors & Fixes |
| An approach that failed and should not be retried | What Doesn't Work |
| A rule about how this codebase is built | Codebase Patterns |
| How a dependency behaves *in this setup* — a pinned version, a config, a combination | Tool & Library Notes |
| An approach that worked and is worth repeating | What Works |
| A decision taken, and why it was taken | Session Notes |
| Unresolved, needs a person to settle it | Open Questions |

Append under the matching heading; if it is somehow missing, use the closest one rather than
inventing a new section. `What Doesn't Work` is skipped most often and repays most — prefer it to
silence. `Session Notes` holds decisions and their reasons, not an account of what was done; git
already has that.

## Quality bar

An entry has to be actionable cold: someone with no memory of this session reads it and knows what
to do or avoid, without investigating again.

- ✗ `vendor/shared is duplicated` — states a fact, implies no action
- ✓ `**2026-09-18** — server/ and client/ hold independent copies of vendor/shared; they have already
  drifted by 17–18 non-comment lines across three files. A change to one does NOT reach the other —
  edit both. Evidence: server/src/vendor/shared/`

Two questions settle most cases:

1. Would anyone reading the code see this anyway? Then it belongs in the code, not here.
2. Would knowing it beforehand have saved time? Then write it.

**A hedge is the tell.** If the entry needs "this might sometimes matter when…", the finding has not
been established yet — it belongs in `Open Questions`, not stated as a rule.

Abstract the lesson rather than logging the incident: "don't patch the logger" helps exactly once,
"don't patch infrastructure that many callers share" keeps helping.

## What this skill does not do

It captures findings about this codebase. It does not review code, summarise the session, track
tasks, or record what was done — git holds that, and a file that fills up with activity logs stops
being read.

These files are written by a model and can summarise wrongly. A reader who finds an entry the code
contradicts corrects it with a new dated entry rather than trusting it.
