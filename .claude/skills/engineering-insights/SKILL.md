---
name: engineering-insights
description: INSIGHTS.md — per-module lessons file. Use when starting any task in server/, client/, reviewer-core/ or e2e/ (read it first); when you hit a dead end, a library quirk, a recurring error or a non-obvious convention (capture it); and before the final reply of a task that changed or investigated module code (wrap-up).
---

# Engineering Insights

Each module keeps its lessons in `<module>/INSIGHTS.md`: `server/`, `client/`, `reviewer-core/`, `e2e/`. Read it before work, record only what a cold reader of the code would not know.

## Steps

### 1. Resolve modules

Map every path the prompt names or the task will touch to its module. Cross-cutting work → every affected module. Root, `scripts/` or `.github/` work → the module whose code it affects.
Done when you have the list of `<module>/INSIGHTS.md` files.

### 2. Read

For each file: if it is missing, create it from [Template](references/TEMPLATE.md) with `<module>` substituted. Then read the whole file before your first plan or edit.
Treat entries as high-confidence guidance. When an entry contradicts the code, the code wins: note the entry for correction in wrap-up.
Done when every resolved file has been read end to end.

### 3. Capture during work

Keep a running list of candidates whenever a section trigger below fires. Record the evidence at the moment you see it (`file:line`, the command, the exact error text) — it is gone by wrap-up.

### 4. Wrap-up — before the final reply

1. Re-read each file; it may have changed during the session.
2. Pass every candidate through the gate. It must pass all five:
   - **Not obvious** — someone reading the code would not see it. If it would be obvious to anyone reading the code, drop it.
   - **Cold-actionable** — an agent reading only this entry knows what to do, without follow-up digging.
   - **Evidenced** — cites `file:line`, a command, or an error text.
   - **New** — no entry already says it. When a similar entry exists, extend or correct that entry in place.
   - **Not already documented** — absent from the module's `CLAUDE.md`, `docs/`, or root `CLAUDE.md`.
3. Apply corrections: rewrite or delete entries the session proved wrong; move answered Open Questions into their proper section.
4. Write the survivors into their sections. Only when at least one entry was added or changed, add one Session Notes line.
5. End the final reply with one line per module: `INSIGHTS <module>: <what was added/changed>` or `INSIGHTS <module>: nothing new`.

Done when every candidate is written, merged, or consciously dropped, and the reply carries the INSIGHTS line.

## Sections

| Section | Belongs here | Trigger |
|---|---|---|
| What Works | An approach that solved a non-trivial problem here, and the context it worked in | A fix or design landed after a less obvious path |
| What Doesn't Work | A dead end, with why it failed — the most valuable section, and the one most often skipped | You reverted, abandoned, or rewrote an approach |
| Codebase Patterns | An unwritten convention or architectural decision, with its reason | You matched existing code and the "why" was not written down |
| Tool & Library Notes | A dependency quirk, version-specific behaviour, CLI gotcha | A library or tool behaved differently from its docs or your expectation |
| Recurring Errors & Fixes | Exact error text → cause → fix | Same error seen twice, or an error whose cause was far from its message |
| Session Notes | `- YYYY-MM-DD — <what was done> → <entries produced>` | Only alongside another entry |
| Open Questions | An unverified hypothesis or unresolved oddity | You suspect something but could not confirm it |

## Entry format

```
- **<imperative rule>** — <why / context>. Evidence: <file:line | command | error text>. (YYYY-MM-DD)
```

One bullet per insight. Lead with the rule so the entry is findable by grep.

## Quality bar

The test: an agent reads it cold and *knows what to do*.

| Bad (noise) | Good (actionable) |
|---|---|
| "Promises can be tricky" | "**Use `Promise.allSettled()` in batches of 10 for the ingest pipeline** — `Promise.all()` times out past 30 items." |
| "Careful with async" | "**Keep checkout state in the Zustand store (`cartStore.ts`)** — three components share the cart; local state desyncs them." |

Gate example: "`instanceof ZodError` fails across duplicate zod instances, match by shape (`server/src/app.ts:149`)" is a good insight, and it fails **Not already documented** — `server/CLAUDE.md` Gotchas already carries it. Drop it.

## Hygiene

- Hypotheses live in Open Questions until verified; What Works holds only confirmed results.
- Entries hold no secrets, tokens, or customer data.
- When a file passes ~150 lines: merge duplicates, delete entries for removed code, and promote stable, frequently relevant entries to the module's `CLAUDE.md` Gotchas (replace the entry with a one-line link to its new home).
- After a dependency upgrade touching a Tool & Library Note, re-verify that note.
