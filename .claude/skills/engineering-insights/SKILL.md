---
name: engineering-insights
description: Reads and appends to the per-module insights files (server, client, reviewer-core, e2e) in the dev-digest repo. Has two triggers. At session start, when a task touches files in one of those packages, it reads that package's insights.md before working. At wrap-up, after a meaningful session (over about 30 minutes, with a real problem resolved) or when something unexpected came up, it appends the lesson to that package's insights.md. Does not apply to general coding tasks outside these packages.
---

# Engineering insights

Each package keeps one append-only file of hard-won, specific knowledge:

| Work location | Insights file |
|---|---|
| `server/…` | `server/insights.md` |
| `client/…` | `client/insights.md` |
| `reviewer-core/…` | `reviewer-core/insights.md` |
| `e2e/…` | `e2e/insights.md` |

Rules live in the root `CLAUDE.md` and each package's `CLAUDE.md`. Setup lives in the READMEs. Insights hold what is learned while working and is not obvious from those.

## Trigger 1: session start (read)

1. Identify the module the task is applied to from the paths you will change.
2. Read **only that module's** `insights.md`. Do not read sibling module files.
3. A task that changes files in two modules reads both files. Each file is read for its own module only.
4. Apply what you find. If an entry conflicts with the code, trust the code and append a new entry that says so (see Append-only below). Do not edit the old one.
5. Before starting work, state the top 3 entries that apply to this task, or say that none apply. This confirms the file was read and actually used, not just loaded.

## Trigger 2: wrap-up (write)

Run this at the end of a task when either condition holds:

- **Meaningful session:** the session ran more than about 30 minutes and a real problem was resolved.
- **Something unexpected:** during the task you hit behavior that contradicted your expectation, a surprising error, or a result that needed investigation. This applies even if the session was short.

Skip minor fixes: typos, a one-line lint fix, a rename, a single obvious bug fix. Those are not worth a future session's attention.

When a trigger fires, write the entry **directly** to the file of the module the task was applied to. Do not ask first. Then mention the file path and entry title in your final message so the user can see it.

Each entry has this shape and goes at the end of the matching section:

```markdown
- **<Concrete title>** — <symptom or context> → <fix or rule> (`<symbol>`, `<file:line>` if known) [YYYY-MM-DD]
  Why: <only if not obvious>
  Verified: <command or test that confirmed it, if any>
  Confidence: high | medium | low
```

One insight per bullet. Keep it atomic.

Every entry must name something concrete: a function, file, flag, env var, error message, library, or command. Cite the **symbol name first**. Add `file:line` only as a pointer, since line numbers drift after edits and symbol names last longer.

**Confidence** separates verified rules from hypotheses. Use `high` only when a run or the code confirmed it. Use `medium` or `low` for a suspected cause; those belong in Open questions unless they already have a concrete symptom.

Before writing, run these checks:

1. **Obviousness test:** if anyone reading the code would already know this, do not write it.
2. **Behavior test:** would a future session do something different because of this entry? If not, skip it.
3. **Duplicate check:** search the file for the same symbol or error text. If an entry exists and is still true, do not add another. If it is wrong, append a `Correction:` entry as described under Append-only.

### Specificity bar

| Too vague (reject) | Specific (write this) |
|---|---|
| "Be careful with async." | "`Promise.all` in the review pipeline times out after ~30 items in `reviewer-core/src/…`; use `Promise.allSettled()` and collect the rejections." |
| "Promises can be tricky." | "A rejected `fetch` inside `useEffect` in `client/src/lib/hooks/…` is swallowed; return the promise from the hook and handle the error in the caller." |
| "State is complicated." | "Checkout state is shared by 3 components, so it lives in the zustand store (`cartStore.ts`). Local `useState` there will desync." |
| "Tests are flaky." | "`e2e/flows/02-*` fails when the dev DB has other repos; run `pnpm e2e:hermetic` instead." |

Banned phrasings in new entries: "be careful", "can be tricky", "watch out", "complicated", "flaky" with no cause, "sometimes", "might". If you cannot name the concrete cause yet, put the item under **Open questions** instead of guessing.

## Append-only

- **Never edit, replace, or delete an existing entry.** Only append.
- If an existing entry is wrong or stale, append a new entry that states the correction and the date, and reference the old entry by its title. Example title: `Correction: <old title>`.
- If an entry is a duplicate of one already present, do not add it again.
- Keep new entries short.

## Structure

Every module file uses these sections, in this order. A section with no entries keeps its heading and `_None yet._`

1. **What works**: approaches confirmed to work, with the evidence.
2. **What does not work**: approaches tried and rejected, with the symptom that rejected them.
3. **Codebase patterns**: conventions specific to this module that the code does not state.
4. **Tool and library notes**: version-specific behavior and config gotchas for tools and libraries the module uses.
5. **Recurring errors and fixes**: error text or symptom → cause → fix.
6. **Decisions**: a choice that was made, with the reason it was made. Use this when a future session might otherwise reverse it.
7. **Session notes**: dated context from a session that does not fit above.
8. **Open questions**: unresolved items, each with what would settle it.

A file that is missing the Decisions section gets it appended as a new heading, after the last existing section and before `## Legacy entries`, when the first Decisions entry is written.

Entries that predate this structure stay where they are, under `## Legacy entries` at the bottom. Do not move them.

Appending to a section means adding the entry after that section's last line, before the next `## ` heading. Where a section still says `_None yet._`, add the entry below it.

## Known risks (from research)

- **Wrap-up is a manual trigger, so it can be skipped.** Sessions that end without the wrap-up learn nothing. Mitigation: the root `CLAUDE.md` "Session context and end of session" section requires the wrap-up. A hook-based trigger would be more reliable but is not set up.
- **Wrap-up output is a draft.** A model may summarize a session wrongly. Entries should reflect what was verified in the session, and the user can spot-check them in git.
- **Long files lose signal.** If a file grows past about 200 entries, the signal drops. Since entries are append-only, do not prune. Instead, raise this as an open question for the user to decide on splitting the file by domain.
- **Stale or contradictory entries accumulate.** Append-only keeps wrong entries in place. Correct them with a dated `Correction:` entry, never by editing.
- **Merge conflicts on shared files.** Several branches appending to the same insights file can conflict in a PR. Resolve by keeping both entries, not by choosing one.
- **Unverified tool claims.** Tool and library notes go stale when versions change. Record the version or command that confirmed the note.
- **Skill not tested on every model.** Haiku and Opus follow the same instructions with different levels of detail. No eval exists yet for this skill; building three test sessions before relying on it is the recommended check.

## Scope rules

- Never write an entry to another module's file, even if it was found while working elsewhere. Write it to the file for the module where the problem was found.
- Never put secrets, personal data, or credentials in an insights file.
- Do not duplicate `CLAUDE.md` rules or README setup steps. Link to them instead.
- Only record facts supported by the code or by a run you did. Record guesses under Open questions.
