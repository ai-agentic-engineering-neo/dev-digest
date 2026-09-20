---
name: engineering-insights
description: "Appends non-obvious engineering findings to the touched module's INSIGHTS.md (client, server, reviewer-core, e2e). Use when a non-trivial bug is diagnosed, a surprising codebase, tool or library behaviour is found, a design decision is made with a reason, an approach is tried and abandoned, or a task that involved debugging or a decision is wrapping up. Also use when the user says add to insights, capture learnings, record insights, wrap up, or engineering insights. Reads the existing file first, never duplicates, writes only substantial file-grounded entries, and is strictly append-only — never overwrites."
---

# Engineering Insights

Capture what the next session would otherwise re-learn the hard way.
Append-only: never rewrite or delete an existing entry.

## 1. Should this run at all

Run at two moments: the instant a finding is confirmed (fix verified, decision
taken), and again when a task wraps up.

**Depth check first.** A short exchange with no tool calls, no errors and no
correction from the user → skip entirely, write nothing, say so in one line.

## 2. What to record — signal ranking

Pick candidates in this order:

1. **An explicit correction from the user** ("no, in this repo we do X") —
   highest signal, record it even when it feels small.
2. A failure that cost real time — wrong assumption, silent misconfiguration.
3. A decision taken, with its reason.
4. A discovered quirk of a tool, library or the codebase.

**Max 5 entries per run.** More candidates than that → keep the top 5 by this
ranking, put the rest in `Open Questions`.

## 3. Write-gate — all four must hold

1. **Recurrence** — this is likely to matter again.
2. **Not inferable** — it cannot be deduced by reading the code.
3. **Stable** — it is not about code being actively rewritten right now.
4. **Project-specific** — it is about DevDigest, not general best practice.

Then the banality test: *if this would be obvious to anyone reading the code,
do not write it.* No entry without evidence (a path, a command, a symptom).

```
BAD   "be careful with async"
BAD   "env vars can break things"
GOOD  "NEXT_PUBLIC_API_BASE mismatch fails silently — dev and vitest both pass
       while every query 404s. Check it first when the studio renders empty."
       (`client/src/lib/api.ts`)
```

## 4. Which file

The module is whichever the task's file paths belong to:

| Touched | File |
|---|---|
| `client/**` | `client/INSIGHTS.md` |
| `server/**` (incl. `server/src/modules/repo-intel`) | `server/INSIGHTS.md` |
| `reviewer-core/**` | `reviewer-core/INSIGHTS.md` |
| `e2e/**` | `e2e/INSIGHTS.md` |
| several modules | the one holding the evidence; one entry per module only if each has its own evidence |
| nothing under a module (`scripts/`, `docs/`, docker) | do not invent a file — say so and propose `docs/` |

## 5. Which section

Every `INSIGHTS.md` has the same seven sections. Append to the one that fits:

- **What Works** — approaches and solutions that held up.
- **What Doesn't Work** — dead ends and antipatterns. *Most valuable section,
  and the one most often skipped — do not skip it.*
- **Codebase Patterns** — conventions and architectural decisions.
- **Tool & Library Notes** — quirks of dependencies and tooling.
- **Recurring Errors & Fixes** — errors seen more than once, with the fix.
- **Session Notes** — dated summaries, under `### YYYY-MM-DD` sub-headings.
- **Open Questions** — what stayed unresolved.

## 6. Entry format

Append at the **bottom** of the matching section. Every entry carries what is
true *and* what to do about it, plus evidence:

```
- YYYY-MM-DD — <what is true>. <what to do / avoid instead>. (`path/file.ts:42`)
```

- In *What Works* and *Codebase Patterns*, lead with the why, then ALWAYS/NEVER.
- An uncertain finding is still worth writing — suffix it `(low confidence)`.

## 7. Before appending

- Read the target file. Skip exact duplicates.
- Skip anything the module's `CLAUDE.md` or `README.md` already states.
- A finding that contradicts an existing entry becomes a **new dated entry
  that supersedes it**. The old entry stays.

## 8. Confirming and reporting

- One obvious insight mid-task → append immediately, report in one line, do
  not interrupt the work.
- Wrap-up with several candidates → **one** `AskUserQuestion` multi-select
  listing the proposed entries, then write the selected ones silently. Do not
  ask again.

Report format: `Recorded: <n> entr(y|ies) → <file> · <section>`.

## Pruning

On request only. Remove entries that reference fixed bugs, duplicate another
entry, or have never proved useful since being written.

## Sources

See [references.md](references.md) for what each source contributed.
