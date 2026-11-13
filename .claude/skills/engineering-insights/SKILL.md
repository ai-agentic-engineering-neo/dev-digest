---
name: engineering-insights
description: Captures non-obvious engineering lessons into the INSIGHTS.md of the package the work touched (client, server, reviewer-core, e2e), append-only, under fixed sections. Use proactively in any session the moment something surprising is learned — a fix that took more than one attempt, a dead-end approach, an undocumented convention, a library quirk, an error that recurs — and at the end of any meaningful task as a wrap-up. Also runs on /engineering-insights.
---

# Engineering Insights

Two triggers, both mandatory:
- **Capture as you go** — as soon as a finding is *confirmed* (the fix works, the dead end is proven), append it. Don't wait for the end; context gets compacted.
- **Wrap-up** — when a task with a problem, decision, or discovery is done, review the session and append what's still missing, plus one Session Notes line. Skip trivial sessions (typo, config bump) — write nothing rather than noise.

## 1. Pick the file

The file is `<package>/INSIGHTS.md` for the package whose code the lesson is about:
`client/` · `server/` (incl. `src/vendor/shared`) · `reviewer-core/` · `e2e/`.
Lesson spans packages → one entry in each, each phrased for *that* package's reader.
Repo-level only (scripts/, docker, CI) → the package whose workflow it breaks.
File missing → create it from [INSIGHTS.template.md](INSIGHTS.template.md).

## 2. Pass the gate — all four, or don't write

1. **Not obvious** — someone reading the code, README, or CLAUDE.md would not already know it.
2. **Would save 5+ minutes** the next time an agent hits this situation.
3. **Verified** — observed in this session (test run, error output, working fix), not a guess.
4. **Not already there** — grep the file first; if it exists, don't restate it.

## 3. Pick the section

| Section | Goes here |
|---|---|
| What Works | An approach that solved a real problem here, and why it beat the obvious one |
| What Doesn't Work | Dead ends, tried-and-failed approaches, antipatterns — **never skip; most valuable** |
| Codebase Patterns | Unwritten conventions and architecture decisions *with their reason* |
| Tool & Library Notes | Quirks of a dependency/tool at the version in the lockfile |
| Recurring Errors & Fixes | Exact error text → root cause → fix |
| Session Notes | One dated line per wrap-up: what was done, which entries were added, `path:line` of the main change/spec |
| Open Questions | Something unresolved the next session should check |

## 4. Write the entry

Append as the last bullet of the section — never edit, reorder, or delete existing entries:

```
- **YYYY-MM-DD** · <what is true, specific names/numbers> → <what to do instead> · `path/to/file.ts:42`
```

Format is fixed and checked — **every** bullet (Session Notes and Open Questions included) has:
- the date as `**YYYY-MM-DD**`, first;
- a trailing `` `path:line` `` from the repo root (e.g. `` `client/src/lib/format-cost.ts:8` ``) pointing at the exact place the lesson is about. For a JSON/spec file, use the line of the key step or the `1` of the spec. No line number → find it (`grep -n`) before writing; never write a bare path.

Actionable cold: a reader with zero context knows exactly what to do.

| ❌ Noise | ✅ Insight |
|---|---|
| Promises can be tricky | `Promise.all()` over the ingest pipeline times out past ~30 items → use `Promise.allSettled()` in batches of 10 · `src/ingest/run.ts:88` |
| Careful with state | Checkout state always goes through Zustand `cartStore.ts` — the cart is shared by 3 components, local state desyncs them |
| (anything already in CLAUDE.md/README) | — it fails gate 1, don't write it |

**Contradicts an older entry?** Append the new one and end it with `(supersedes YYYY-MM-DD entry)`. The old line stays — a human prunes.

## 5. Report and hygiene

- After writing, tell the user in one line per entry: file · section · gist. INSIGHTS.md is a draft for human spot-check, not truth.
- File over ~200 entries, or two entries clearly conflict → tell the user it needs a prune or a split into domain files (`INSIGHTS-db.md`); do not prune yourself.
- Never write secrets, tokens, customer data, or chat transcripts — extract the lesson, not the story.
