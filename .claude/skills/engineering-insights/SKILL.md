---
name: engineering-insights
description: Reads and maintains the per-package INSIGHTS.md files (client, server, reviewer-core, e2e) — the project's learnings loop. Use at the start of EVERY task after the user's prompt, before the first action, to load prior lessons for the package(s) involved; whenever a user correction, failed approach, stubborn error, tool/library surprise or trade-off decision happens; and before finishing a task that changed code or hit problems, to record only new, verified, significant insights. Also use on "wrap up", "capture insights", "what did we learn", /engineering-insights, or /engineering-insights audit to review the files and propose cleanups.
argument-hint: "[audit]"
---

# Engineering Insights

Each package keeps its lessons in `<pkg>/INSIGHTS.md`. This skill closes the loop:
**read before work → capture while working → write (or skip) before finishing.**
Invoked with `audit` → go straight to [Audit mode](#audit-mode).

## Module map

| Task touches / talks about | Insights file |
|---|---|
| `server/**`, API, DB, migrations, repo-intel, adapters | `server/INSIGHTS.md` |
| `client/**`, UI, pages, hooks, next-intl | `client/INSIGHTS.md` |
| `reviewer-core/**`, prompt, grounding, LLM output | `reviewer-core/INSIGHTS.md` |
| `e2e/**`, agent-browser flows | `e2e/INSIGHTS.md` |
| Cross-package (shared contracts, CI `paths:`, `scripts/dev.sh`) | every affected package's file |

Unsure which package? Pick it from the files the task will touch. Touches two → read both.

## Phase 1 — READ (right after the prompt, before any other action)

1. Read the INSIGHTS.md file(s) from the module map — fully, they are short by design.
2. Print one line naming up to 3 most relevant entries, so the user sees it happened:
   `INSIGHTS (server): 2 relevant — <title>; <title>` or `INSIGHTS (server): nothing relevant`.
3. Follow the `Rule:` of every relevant entry; entries under What Doesn't Work are approaches
   NOT to try again. If an entry contradicts the code you see, trust the code and propose a fix to
the entry in Phase 3 (don't edit it yourself).

Skip Phase 1 only for questions unrelated to this repo's code.

## Phase 2 — CAPTURE (while working)

Watch for these signals, strongest first:
1. **User correction** — "no, not like that", a rejected edit, a reverted change.
2. **Abandoned approach** — you tried something, it failed, you switched.
3. **Stubborn error** — it took more than one attempt to fix.
4. **Surprise** — a tool, library or part of the codebase behaved differently than expected.
5. **Trade-off** — a choice between alternatives for a reason the code doesn't show.

On a signal, keep a short mental draft: what happened, why, what to do next time, evidence
(file:line, command, error text). Do NOT write to the file yet — a draft is not verified until
the fix/observation is confirmed. Which section fits and examples: [rubric.md](rubric.md).

## Phase 3 — WRITE (before the final answer of a task that changed code or hit problems)

Copy this checklist and work through it:

```
Insights wrap-up:
- [ ] No drafts from Phase 2 → report "Insights: nothing new" and stop here
- [ ] Read rubric.md (section criteria, vague-vs-useful examples, "Always skip")
- [ ] Re-read INSIGHTS.md of every touched package (it may have changed)
- [ ] Run each draft through the 5-question gate below
- [ ] Dedupe: skip / propose a change to an existing entry / add new entry
- [ ] Keep at most 3 new entries — the strongest signals from Phase 2
- [ ] Write into the right section, newest first, in the entry format
- [ ] Run the checker; fix ERRORs in your new entries, propose fixes for existing ones
- [ ] Report the outcome in one line
```

### The gate — write only if ALL five are "yes"

1. **Non-obvious** — not evident from reading the code, `<pkg>/CLAUDE.md`, README or TESTING.md.
2. **Worth it** — it cost time, or will save ≥5 minutes next time.
3. **Actionable cold** — names a concrete file, command, value or error; a fresh agent can act on it without re-investigating.
4. **Verified** — confirmed in this session (fix worked, behaviour observed). Promising but
   unverified → record it under Open Questions instead.
5. **New** — not already in INSIGHTS.md or CLAUDE.md.

If it refines or contradicts an existing entry → don't touch that entry and don't add a second,
conflicting one: propose the change to the user (see "Existing entries" below).

### Existing entries — propose, never change on your own

Only append new entries. Never edit, merge or delete an existing entry by yourself — including
stale, duplicate or contradicting ones. List them after the report instead:

```
Proposed insight changes (need your OK):
- server/INSIGHTS.md "<title>": update Rule → "<new text>" — reason: <evidence>
- client/INSIGHTS.md "<title>": delete — reason: src/foo.ts no longer exists
```

Apply a proposal only after the user explicitly approves it, and then append
`(updated YYYY-MM-DD: …)` to the changed entry.

**Nothing passed the gate → write nothing.** That is the expected result for most small tasks.

### Writing the entry

- Generalize one level: name the class of problem, not just the incident
  ("every `*.it.test.ts` needs Docker running", not "user.it.test.ts failed today"). The incident goes into Evidence.
- `Rule:` starts with ALWAYS, NEVER or an imperative verb.

```
### YYYY-MM-DD — short title
- What: specific fact / symptom / error text
- Why: cause or rationale
- Rule: what to do next time
- Evidence: path/file.ts:42 · command · commit
```

- ≤5 lines under the title. Open Questions use only `What` + `Evidence`.
- Cross-package insight → the same entry in every affected package's file, plus
  `- Also in: server/INSIGHTS.md, client/INSIGHTS.md` (6th line allowed). An approved change
  applies to all copies together.

### Checker

```bash
node .claude/skills/engineering-insights/scripts/check-insights.mjs
```

Checks sections, entry format and length, required fields, stale Evidence paths, duplicate
titles and secret-looking strings. ERROR in an entry you just wrote → fix it before finishing.
ERROR or WARN in an existing entry → add it to "Proposed insight changes" (flag a secret as urgent).

### Report (last line of your answer)

`Insights: +2 new (server), 1 skipped (already in server/CLAUDE.md), 1 change proposed`
or `Insights: nothing new`. Proposed changes to existing entries follow as a list (see above).

## Audit mode

Run on `/engineering-insights audit`, or suggest it when a file passes ~30 entries.
Audit is read-only until the user approves — it produces a list of proposals, nothing more.
1. Run the checker.
2. Stale entries (Evidence path gone, code changed) → propose update or delete.
3. Duplicates / contradictions → propose one merged, authoritative entry.
4. Open Questions answered by now → propose moving the answer into its section.
5. Stable rules → propose promoting them into `<pkg>/CLAUDE.md` (and removing them from INSIGHTS).
6. Show the proposals in the "Proposed insight changes" format; apply only the ones the user approves.

## Gotchas

- Not a session diary or a chat replay — record the lesson, not the story of the session.
- Never write secrets, tokens, `.env` values or git remotes from `server/clones/` (they contain the GitHub token).
- File the entry where the knowledge applies, not where you happened to be working.
- Project lessons go to INSIGHTS.md (committed, shared with the team), not to the agent's personal
  auto-memory — that is for the user's own preferences.
- Only the 6 sections of INSIGHTS.md — don't create LEARNINGS.md, NOTES.md or new sections.
- Never edit or delete an existing entry or CLAUDE.md without the user's explicit OK — propose instead.
- Never add an entry just to show the loop ran; generic advice ("be careful with async") always fails gate #3.
