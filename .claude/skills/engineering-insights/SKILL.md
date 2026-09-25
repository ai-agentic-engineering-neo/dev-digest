---
name: engineering-insights
description: "Captures non-obvious engineering learnings into the INSIGHTS.md of the package being worked on (server, client, reviewer-core, e2e), append-only, via a script. Use during any coding session when a fix, workaround, failed approach, decision, library quirk, or user correction surfaces something a reader of the code would not see; and at the end of every task as a wrap-up sweep. Trigger phrases: insight, learning, lesson, gotcha, wrap up, wrap-up, retro, what did we learn, add to insights, remember this, /engineering-insights."
argument-hint: "[wrap-up | <module> | <insight text>]"
paths:
  - "server/**"
  - "client/**"
  - "reviewer-core/**"
  - "e2e/**"
allowed-tools:
  - "Bash(.claude/skills/engineering-insights/scripts/insight.sh *)"
  - "Bash(./.claude/skills/engineering-insights/scripts/insight.sh *)"
  - "Read"
  - "Grep"
metadata:
  tags: insights, learnings, memory, wrap-up, retrospective
---

# Engineering insights

Each package keeps an append-only `INSIGHTS.md` next to its code. This skill
decides **what** is worth writing; the script decides **how** it is written.
Never hand-edit an `INSIGHTS.md`. Always go through
`scripts/insight.sh` so sections, dates, and duplicate checks stay mechanical.

## Where it writes

| Files touched under | Module | File |
|---|---|---|
| `server/` (incl. `server/src/modules/repo-intel/`) | `server` | `server/INSIGHTS.md` |
| `client/` | `client` | `client/INSIGHTS.md` |
| `reviewer-core/` | `reviewer-core` | `reviewer-core/INSIGHTS.md` |
| `e2e/` | `e2e` | `e2e/INSIGHTS.md` |

`insight.sh module <path>` resolves this. A learning about a cross-package seam
(e.g. the shared contracts copy) goes to the package where the fix was applied.
Repo-wide rules do not belong here; they belong in the root `CLAUDE.md`.

## When to capture

Capture **immediately**, not later, when one of these happens:

1. The user corrects you. Highest signal. Write the corrected rule, not the mistake story.
2. An approach failed and you had to work around it. Failed approaches are the most valuable entries.
3. A fix took real digging: the cause was not visible from the file you started in.
4. A decision was made with a rejected alternative and a reason.
5. A library, tool, or env behaved differently from its docs or from expectation.
6. You had to ask or look something up that the next session will hit again.

Then run a **wrap-up sweep** at the end of every task that lasted more than a
few minutes or involved any of the above. Do not skip it. Trivial edits with no
discovery need no entry; an empty sweep is a valid outcome.

## What qualifies

Keep only entries that pass all four filters:

- **Recurs.** The next session would hit the same gap.
- **Not inferable.** Someone reading the relevant file would not see it. Test: "if this is obvious to anyone reading the code, do not write it."
- **Stable.** A property of the design or tooling, not of code in flux.
- **Project-specific.** General best practice is noise here.

Reject outright: truisms ("tests are important"), anything already in the
package `README.md`, `CLAUDE.md`, or an existing entry, one-off task details,
narrative ("today I fixed…"), and entries with no file, flag, command, symbol,
or error text in them.

## Entry format

One insight per entry. One or two sentences, cold and actionable: a reader who
knows nothing about this session must know what to do. Name the concrete thing:
the file, the flag, the command, the error string, the symbol. The script adds
the date and places the entry in its section:

```
- [YYYY-MM-DD] <what is true / what to do>. Evidence: `path:line-or-symbol`.
```

Prefer a symbol or function name over a bare line number when the line is
likely to drift. Never overwrite or delete an entry: correct it with a new dated
entry that says what superseded it. Tag uncertain entries with `[REVIEW NEEDED]`.

| Section key | Heading | Put here |
|---|---|---|
| `works` | What Works | approaches confirmed to hold in this package |
| `doesnt` | What Doesn't Work | dead ends, anti-patterns, things that look right and fail |
| `patterns` | Codebase Patterns | conventions and architectural decisions with their reason |
| `tools` | Tool & Library Notes | dependency, tooling, and env quirks |
| `errors` | Recurring Errors & Fixes | exact error text plus the fix |
| `session` | Session Notes | one dated line per wrap-up: what changed, what was learned |
| `questions` | Open Questions | unresolved, phrased as a question |

## Procedure

```sh
S=.claude/skills/engineering-insights/scripts/insight.sh
$S module <path-you-edited>                 # → server | client | reviewer-core | e2e
$S check <module> "<text>"                  # exit 2 = near-duplicate; extend that entry with a new dated line instead
$S add <module> <section> "<text>" --evidence "<path:line-or-symbol>"
$S list <module> [section]                  # read before writing at session start
```

`add` refuses near-duplicates; pass `--force` only when the new entry genuinely
supersedes the old one, and say so in the text.

## Wrap-up checklist

Copy and tick at the end of a task. Cap: five entries per wrap-up, ranked by
signal (user corrections first, then failed approaches, then repeated patterns,
then error patterns).

```
- [ ] Which packages did I touch?  ($S module on each edited path)
- [ ] Any user correction this session?           → doesnt / patterns
- [ ] Any failed approach or workaround?           → doesnt
- [ ] Any fix whose cause was elsewhere?           → errors (with the exact error text)
- [ ] Any decision with a rejected alternative?    → patterns
- [ ] Any tool, dependency, or env surprise?       → tools
- [ ] Anything I had to look up that will recur?   → works / patterns
- [ ] Anything still unresolved?                   → questions
- [ ] One dated session line                       → session
```

## Reading at session start

Before the first change in a package, run `$S list <module>` and state the two
or three entries most relevant to the task in one line each. This forces active
reading and confirms the file loaded. Treat entries as high-confidence guidance
unless the code proves otherwise; if the code proves otherwise, add a correcting
entry.

## Maintenance (human-owned, not part of a wrap-up)

A file above roughly thirty entries per section or two hundred lines total is
losing signal. Periodically: merge duplicates, delete entries whose code is
gone, move answered Open Questions into their answering section, and promote a
repo-wide rule to `CLAUDE.md`. The file is a reviewed draft, not ground truth.

## Files in this skill

- `scripts/insight.sh` — run it; never load it into context.
- `reference/examples.md` — vague vs useful pairs. Read when unsure whether an entry qualifies.
- `reference/automation.md` — optional Stop-hook nudge that makes the wrap-up unconditional. Read when asked to automate capture.
