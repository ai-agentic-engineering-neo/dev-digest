---
name: engineering-insights
description: Captures durable engineering lessons — gotchas, dead ends, and hard-won decisions — into each module's INSIGHTS.md. Proactively use when hitting a non-obvious bug, finding a dead end, making a non-default architectural decision, resolving a recurring error, or wrapping up a work session. Covers server/, client/, reviewer-core/, and e2e/.
---

# Engineering Insights

Keep each module's `INSIGHTS.md` a living record of non-obvious lessons — a
distillation, not a session transcript.

## Anti-banality test
Before writing an entry, ask: "Would this be obvious to anyone reading the
code?" If yes, skip it.
- Bad: "Promises can be tricky." Good: "`Promise.all()` on the ingestion
  pipeline times out after 30 elements — use `Promise.allSettled()` in
  batches of 10 (`src/ingest.ts:42`)."
- Bad: "Be careful with async." Good: "Checkout state always goes through
  Zustand (`cartStore.ts`) because the cart is shared by 3 components."

## Target sections (append to the matching one)
1. **What Works** — approaches/patterns that succeeded.
2. **What Doesn't Work** — dead ends, antipatterns.
3. **Codebase Patterns** — conventions, architectural decisions.
4. **Tool & Library Notes** — dependency/tooling quirks.
5. **Recurring Errors & Fixes** — errors seen more than once, and the fix.
6. **Session Notes** — datestamped session summaries.
7. **Open Questions** — unresolved items.

## Entry format
`### YYYY-MM-DD — <Title>` under the matching section, newest first within
that section. Body: 1-4 sentences — the essence + evidence (`file:line`,
commit, or PR) where applicable. Must be actionable to a reader with zero
session context.

## Which file
Determine which module the current work touches (`server/`, `client/`,
`reviewer-core/`, `e2e/`) and append ONLY to that module's `INSIGHTS.md`.
Never write to more than one file per insight; there is no root-level file.

## Rules
- **Append-only.** Never edit or delete a past entry, even a stale one — add
  a new dated entry that corrects it instead.
- **Insert, don't rewrite.** Add the new entry with a targeted edit directly
  under the matching section heading (above any existing entries in that
  section). Never regenerate or resubmit the whole file — that risks silently
  dropping or altering unrelated sections/entries. If the file doesn't exist
  yet, create it with only the standard 7-section skeleton, empty.
- **Skip if nothing insight-worthy happened.** Zero new entries is a fine
  outcome for a routine session.
- **Not a substitute for fixing root causes.** If the same mistake recurs
  because of bad tooling/docs, fix the tooling/docs — don't just re-log it.

## Triggers
- **Capture-as-you-go**: the moment you hit a non-obvious bug, dead end, or
  make a non-default decision, add the entry — don't wait to be asked.
- **End-of-session wrap-up**: when the user says "wrap up" / "update
  insights", or a task/session is ending, review what happened and log
  anything that passes the anti-banality test above.
