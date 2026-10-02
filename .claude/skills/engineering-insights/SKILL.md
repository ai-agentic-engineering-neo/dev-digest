---
name: engineering-insights
description: >-
  Reads and records DevDigest's module-local engineering insights. Use at the
  START of any task to read the INSIGHTS.md of the module the request
  concerns, before answering or touching code. Use at the END of any
  non-trivial task to record what was learned, if anything substantial was
  learned, back into that same file. Covers which module's INSIGHTS.md a
  finding belongs in, which of its fixed sections, the specificity bar an
  entry must clear, and the duplicate check that runs before writing.
  Triggers: "insights", "INSIGHTS.md", "wrap up", "what did we learn",
  "record this", "lesson learned", "session review", "retro", starting work
  in a package, ending a session where something non-obvious happened.
---

# engineering-insights

A two-half loop over the `INSIGHTS.md` files. **Read** at the start of a
task, **record** at the end. Insights are module-local by design: a task in
`client/` reads `client/INSIGHTS.md`, not all five. Knowledge lives next to
the code it is about.

## Step 1 — Read first (mandatory)

Before answering or touching code, on the user's first prompt of the task:

1. Resolve the module from the request using the table below.
2. Read that `INSIGHTS.md` in full — the files are short by design, read
   them, don't grep them.
3. Also read the root `INSIGHTS.md` when the work spans two or more
   packages, or touches `*/vendor/shared/**`.
4. State one line: which file, and whether it had anything relevant. Example:
   `Read client/INSIGHTS.md — nothing on this yet.` A silent read is
   indistinguishable from no read; the sentence is what makes it real.

### Module resolution

| The work touches | File |
|---|---|
| `server/**`, including `src/modules/repo-intel/**` | `server/INSIGHTS.md` |
| `client/**` | `client/INSIGHTS.md` |
| `reviewer-core/**` | `reviewer-core/INSIGHTS.md` |
| `e2e/**` | `e2e/INSIGHTS.md` |
| `scripts/`, `.github/`, `docker-compose.yml`, root docs, `*/vendor/shared/**`, or ≥2 packages | `INSIGHTS.md` (root) |

## Step 2 — Record last (conditional)

### 2a. Gate — is there anything to record?

Judge by substance, not by how long the session ran. A rename, a routine
feature that went exactly as expected, a typo fix → **write nothing, say
"nothing worth recording", stop.** Recording noise is worse than recording
nothing.

If something non-obvious did happen, rank candidates — highest signal first:

1. **A user correction** — "no, do it this way." The repo or the agent's
   default was wrong; this is the strongest signal there is.
2. **An approach that was tried and abandoned**, and why.
3. **Friction hit more than once** — the same error or workaround twice.
4. **A convention only visible by reading code** — not in `CLAUDE.md` or
   `README.md`.
5. **A dependency or toolchain quirk.**

Cap at **3 entries per session**. If every candidate looks worth writing,
the bar is being applied too loosely.

### 2b. Dedupe before writing (mandatory)

For each surviving candidate, before appending anything:

1. Re-read the target `INSIGHTS.md` (or reuse the Step 1 read if the module
   matches).
2. `grep -i '<key term>' <module>/INSIGHTS.md` for a near-duplicate.
3. If one exists, don't append a copy — **refine that entry** instead:
   sharpen the claim, bump the date, add the new evidence. If it already
   says the same thing, skip and note it was already covered.
4. If the new finding contradicts an existing entry, correct the old one
   with a dated note — never leave both standing.

### 2c. Write

**Never rewrite the file from memory.** You already have its exact current
content from Step 1 or 2b — insert the new entry as a targeted edit anchored
on that text (directly after the section's `## Heading` line, or after its
last existing bullet). Every line already in the file must survive
untouched; the only allowed diff is the one entry being added or refined.
Don't reconstruct the whole file and pass it to a tool that overwrites the
file wholesale — that's how existing entries silently vanish.

Append under the correct fixed section, newest entry first within that
section. Every section but `Decisions` takes a dated bullet, claim-first,
evidence-last, hard-wrapped, ending in a `path:line` or a runnable command.
`Decisions` takes a three-line block instead:

```markdown
### 2026-09-17 — <the decision, one sentence>

**What:** the decision, in one sentence.
**Why:** the constraint that forced it.
**Rejected:** what was tried, and how it failed.
```

Never delete an entry that still holds. When something an entry warns about
gets fixed, mark it rather than removing it, so the next reader knows the
warning is historical:

```markdown
- **2026-09-17** — … original claim … **Fixed 2026-09-30 in `server/src/…`.**
```

### 2d. Report

One line per action, then stop — no trailing summary:

```
client/INSIGHTS.md — added under What Doesn't Work: <one-line claim>
Skipped: <candidate> (already covered by the 2026-08-14 entry)
```

## Fixed sections

Never invent a new heading — file under the closest fit.

| Section | What belongs there |
|---|---|
| `Decisions` | A choice made, with the alternative that was rejected |
| `What Works` | An approach that solved something and should be reused |
| `What Doesn't Work` | A dead end — most often skipped, most valuable |
| `Codebase Patterns` | A convention discoverable only by reading the code |
| `Tool & Library Notes` | A dependency, CLI, or toolchain quirk |
| `Recurring Errors & Fixes` | A symptom you'll hit again, and its cause |
| `Session Notes` | A dated one-liner that doesn't fit any section above |
| `Open Questions` | Something left unresolved, for the next session |

## The bar

An entry must be actionable **cold** — the next session reads it and knows
what to do without re-deriving anything.

| ✗ Noise | ✓ Insight |
|---|---|
| "Promises can be tricky" | "`Promise.all()` on the ingest pipeline times out past ~30 items — use `Promise.allSettled()` in batches of 10" |
| "be careful with checkout state" | "checkout state always goes through `Zustand` (`cartStore.ts`) — 3 components share the cart, local state won't see updates" |
| "watch out for vendored code" | "editing `client/src/vendor/shared/` alone silently desyncs it from `server/src/vendor/shared/` — there's no sync script, diff both before trusting either" |

Test: if it would be obvious to anyone reading the code, don't write it.
Generic advice is the failure mode — "use async carefully" is true
everywhere and therefore useful nowhere.

## Keeping the files lean

- Roughly **5 entries per section** — past that, signal drops.
- When an entry becomes stable reference material, promote it into
  `<module>/docs/` and delete it here. That's what keeps these files short.
- An entry that no longer holds is worse than no entry — correct or mark it,
  don't leave it stale.

## What this skill does not do

It captures insights only. It does not review code, write documentation,
update `specs/`, or run tests. `INSIGHTS.md` is not a session diary — it
holds durable findings, not a record of what happened.
