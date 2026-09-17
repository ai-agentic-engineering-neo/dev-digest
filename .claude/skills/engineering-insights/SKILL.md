---
name: engineering-insights
description: Use at the start of any coding session to read the touched module's INSIGHTS.md before doing other work, and again when wrapping up to append a lesson to that same file. Use whenever a session hit a surprising bug, a dead end, a library or version quirk, a convention discovered the hard way, or a decision worth keeping for next time. Also use when the user says "wrap up", "capture learnings", "session insights", "what did we learn", or invokes /engineering-insights.
---

# Engineering Insights

Every session starts cold. Without a place to leave notes, the same quirk gets
rediscovered, the same dead end gets walked again, and what the team knows stays in
people's heads instead of the agent's. `INSIGHTS.md` is where the previous session
leaves notes for the next one.

This is the `LEARNINGS.md` pattern; this repo calls the file `INSIGHTS.md` and keeps
one per module, so a session in `server/` reads server's lessons, not client's.

**Two halves, and the reading half matters more.** A file nobody reads is a file not
worth writing. Read first, always. Write only when there is something real.

## Where the files live

| Module | File |
|---|---|
| `client` · `server` · `reviewer-core` · `e2e` | `<module>/INSIGHTS.md` |
| cross-module, tooling, CI, root config | `INSIGHTS.md` (repo root) |

Don't guess the module — ask git:

```bash
.claude/skills/engineering-insights/scripts/detect-module.sh
```

It prints the target file(s) from the working tree. When the user's prompt names a
module the script hasn't seen changes in yet (start of session, nothing edited), trust
the prompt.

## A. Read first — before any other work

Do this before the first `Read`, `Grep`, or `Edit` of the session, not after.
Reading it afterwards is reading a postmortem.

1. Resolve the target module (script, or the user's prompt).
2. Read that `<module>/INSIGHTS.md` in full. Work spanning two modules → read both,
   plus root.
3. **Say out loud the 1–3 entries that bear on this specific task.** Not a summary of
   the file — the entries that change what you're about to do. If none apply, say that.

That last step isn't ceremony. Naming the relevant entries forces you to actually
process them instead of letting the text sit inertly in context, and it shows the user
whether the file was read at all.

Treat what you find as high-confidence guidance unless the user says otherwise. If an
entry contradicts what you're about to do, raise it before doing it.

## B. During the session — hold, don't write

When something non-obvious surfaces, keep it as a candidate. Don't write yet.

Write only after the fix is confirmed working. An unverified guess in `INSIGHTS.md` is
worse than an empty file: the next session will trust it and act on it.

## C. Wrap up — three gates

```
Any candidate from this session?
  └─ no ──→ write nothing. Say "no insight worth recording." Done.
  └─ yes
       │
   Re-read the target INSIGHTS.md   (mandatory — it may already be in there)
       │
   Three gates. ALL must pass:
       ├─ Non-obvious?   Would this be obvious to anyone reading the code? → drop it
       ├─ Actionable cold?  Would an agent reading this in a month know what to do,
       │                    without re-investigating? → if not, sharpen or drop it
       └─ Not already covered?  → see "Already there?" below
       │
   Append to the right section. Never overwrite.
```

**Writing nothing is a normal outcome, not a skipped step.** Most sessions produce no
insight. A file that grows every session fills with noise, and noise is what makes
people stop reading it — which kills the whole loop.

The opposite failure is just as real: a session that burned an hour on something
genuinely surprising and recorded nothing wastes that hour permanently. Both gates
matter. Don't invent an entry to look productive; don't skip a real one out of
tidiness.

**Already there?** Three cases:
- Same lesson, already recorded → write nothing.
- Existing entry is **wrong or now outdated** → don't edit it, don't duplicate it.
  Append a dated correction directly beneath it:
  `> **2026-09-17 correction:** the 5MB limit was lifted in v6; select-vs-include no longer matters.`
- Genuinely new angle on the same area → new entry, and reference the existing one.

Append-only is not pedantry. This file is shared and versioned; rewriting an entry
erases a teammate's lesson and turns every merge into a conflict. A dated correction
keeps both the old belief and the reason it changed.

## D. Entry format

```markdown
### <Short, specific title> (YYYY-MM)

<2-4 sentences: what happened, why it wasn't obvious, what it cost.>

**Rule:** <what to do next time, readable cold> (`path/file.ts:42`, commit `abc1234`)
```

The evidence pointer is required. It makes the claim checkable, it gives the next
session somewhere to start, and needing one is what stops vague entries from being
written at all — you can't cite a file for "be careful with async".

## The seven sections

Every `INSIGHTS.md` has these as `##` headings, in this order; entries go under
exactly one of them as `###`. A section with nothing in it reads `_No entries yet._` —
leave that line in place until the section has a real entry.

| Section | What belongs there |
|---|---|
| **What Works** | An approach that worked and should be reused here |
| **What Doesn't Work** | Dead ends and antipatterns — **the most valuable section, and the one most often left empty** |
| **Codebase Patterns** | Conventions and architectural decisions you can't infer from the code |
| **Tool & Library Notes** | Quirks of dependencies, versions, tooling |
| **Recurring Errors & Fixes** | An error that has now bitten twice or more, plus the fix |
| **Session Notes** | Dated summary — only when the lesson fits nowhere above |
| **Open Questions** | What's still unresolved |

`What Doesn't Work` gets skipped because failures feel like things to forget. They're
the highest-value entries in the file: knowing an approach is a dead end saves the next
session the entire hour you just spent proving it.

`Session Notes` is deliberately narrow. Left open it becomes a chat transcript, and the
signal drowns.

## Quality bar

Test for every entry: **"if this would be obvious to anyone reading the code, don't
write it."** Second test: would it save someone 5+ minutes next time?

| Bad | Good |
|---|---|
| "Promises can be tricky" | "`Promise.all()` on the ingest pipeline times out past 30 items — use `Promise.allSettled()` in batches of 10 (`src/ingest/run.ts:88`)" |
| "be careful with async" | "Checkout state always goes through Zustand (`cartStore.ts`) — three components share the cart, local state silently desyncs" |
| "migrations can break" | see the journal-corruption entry in `server/INSIGHTS.md` — symptom, cause, cost, rule, commit |

More examples per section, dedup heuristics, and pruning rules: read `reference.md`
when you're about to write an entry.

## Red flags

- Writing an entry before the fix is verified
- Writing an entry you can't attach a `file:line` or commit to
- Rewriting or reflowing an existing entry instead of appending
- Summarizing the whole INSIGHTS.md back at the user instead of naming the 1–3 relevant entries
- Reading INSIGHTS.md after editing code instead of before
- Adding an entry because the session felt long, not because something was learned
