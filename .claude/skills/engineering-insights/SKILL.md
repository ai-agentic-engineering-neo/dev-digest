---
name: engineering-insights
description: Captures non-obvious, verified engineering learnings into the INSIGHTS.md of the module being worked on (server, client, reviewer-core, e2e, or the repo-root INSIGHTS.md for cross-package findings). Use proactively mid-session the moment something is confirmed — the user corrects the agent, a fix needed more than one attempt, an approach was abandoned, a library/tool behaved unexpectedly, an undocumented convention was inferred, an error recurred, or a decision was made for a non-obvious reason — and once as a wrap-up at the end of every non-trivial task. Also use when the user says "wrap up", "retro", "save insights", "save learnings", "what did we learn", "remember this for the project", or asks to review, prune or consolidate insights.
---

# Engineering Insights

Persist what this session learned so the next session does not re-learn it.
Output goes into committed, per-module `INSIGHTS.md` files that later sessions read before working in that module.
These files are shared team knowledge. Personal preferences go to Claude's private memory, not here.

Modes: **capture** (mid-session, one entry) · **wrap-up** (end of task) · **review** (on request: prune and consolidate).

## When to capture

Write the entry right after the finding is *confirmed*: a test passes, a command succeeds, the behaviour is reproduced, or the user states the rule.
Do not defer it. The "why" is gone within a day. It takes one Edit; then go back to the task.

Signals, strongest first:
1. **The user corrected you.** "No, do it this way" is the highest-signal event there is.
2. **An approach was abandoned**, or a fix worked only after an earlier attempt failed. Record what failed as well as what worked.
3. **The same error appeared twice.**
4. **Code, docs, or a library behaved differently** from what you assumed.
5. **A convention you had to infer** from several files because nothing documents it.
6. **A choice between alternatives** whose reason is not visible in the code.

Not here:
- An active, unresolved bug. Put it in Open Questions, or the issue tracker if one exists.
- A design document → `docs/`.
- A personal style preference → private memory.
- **A workaround for something fixable.** If the root cause can be fixed (a long command, a missing script, a confusing API), fix it or propose the fix. Record the insight only if the workaround must stay.

## Where to write: route by the files the finding is about

| Finding concerns | File |
|---|---|
| `server/**` (incl. `repo-intel`, `vendor/shared`, migrations, jobs) | `server/INSIGHTS.md` |
| `client/**` | `client/INSIGHTS.md` |
| `reviewer-core/**` | `reviewer-core/INSIGHTS.md` |
| `e2e/**` | `e2e/INSIGHTS.md` |
| `scripts/`, `docker-compose*`, the repo root, or several packages at once | `INSIGHTS.md` (repo root) |

If a finding belongs to one package but bites another, write it in the package that owns the fix.
Add a one-line pointer in the other package: `see server/INSIGHTS.md 2026-11-21`.
If the file is missing, create it from `assets/INSIGHTS.template.md`.

## Sections: pick exactly one

| Section | Qualifies if… |
|---|---|
| **What Works** | It is the non-default approach, and the default fails or is worse here |
| **What Doesn't Work** | It was tried and failed. This is the most valuable and most skipped section. **Always name the alternative** |
| **Codebase Patterns** | It is a convention or architectural decision *with its reason*, absent from CLAUDE.md, README and docs |
| **Tool & Library Notes** | It is a quirk of our pinned versions, CLIs or setup, not general library knowledge |
| **Recurring Errors & Fixes** | It starts with the exact error text, which someone will search for next time |
| **Session Notes** | It is one line per substantial session: goal · outcome · open end. Keep only the last 10 |
| **Open Questions** | It is suspected but *not* confirmed. Guesses never go in the other sections |

## Entry format

```
- YYYY-MM-DD · <trigger: what happened> · <rule — why> · `evidence`
```

- **At most 2 lines.** If it needs a paragraph, it is documentation, not an insight.
- **Write the rule as an imperative with the reason.** Use "use X — because Y". For What Doesn't Work, use "X fails because Y — do Z instead".
- **Generalize one level, but stay concrete.** Write "don't patch shared infrastructure for a single caller — wrap it", not just "don't patch logger". Keep the real names: files, functions, commands, values.
- **Evidence** is a repo path plus symbol, a command, or the exact error string.
  **No line numbers**, because they rot with the next edit. Evidence is optional only in Session Notes and Open Questions.

Real good and bad entries from the sources are in `references/examples.md`.

## Quality gate: an entry must pass all eight

1. **Not inferable.** Someone reading the code, CLAUDE.md, README or docs would not already know it.
2. **Saves time.** It would save 5+ minutes the next time an agent hits this situation.
3. **Actionable cold.** A future agent reading only this line knows what to do. Reject entries like "be careful with async".
4. **Verified** in this session. Otherwise it goes to Open Questions. A wrong entry misleads every future session.
5. **Durable.** It is still true next month. A one-off typo, a transient error or temporary local state does not qualify.
6. **Project-specific.** It is not a generic best practice that is true in any codebase.
7. **New.** You read the **whole** target file first, because the same lesson may be worded differently.
   If it is already covered, skip it. If it refines an existing entry, write a superseding entry.
8. **Safe.** No secrets, tokens or personal data.

Writing nothing is a valid outcome. Never add an entry just to have output.

## Writing: only through the script, never by hand

Existing content in an INSIGHTS.md is never overwritten. That covers entries, headers, and anything a human added.
To guarantee it, **all writes go through the script**:

```bash
S=.claude/skills/engineering-insights/scripts/insights.mjs
node $S append server "What Doesn't Work" '2026-11-21 · <trigger> · <rule — why> · `server/src/platform/jobs.ts`'
node $S supersede server "<unique substring of the old entry's first line>"
```

- `append` inserts the entry at the end of its section. It refuses bad format, unknown sections and exact duplicates. It creates the file from the template only if the file does not exist.
  After writing, it re-reads the file and checks that every old line is still present in order. If not, it restores the original and exits 1.
- `supersede` adds the `[SUPERSEDED] ` prefix to exactly one matching entry. Nothing else changes.
- For a two-line entry, pass a newline inside the quotes. The script indents the continuation line.

**Never** use Write on an existing INSIGHTS.md. **Never** use Edit to replace existing text in one. If the script refuses, fix the entry. Do not route around the refusal.

- **Correct by superseding.** Append the new entry ending with `(supersedes YYYY-MM-DD)`, then run `supersede` on the old entry.
- **Promotion.** If an entry is an always-on rule every session needs, *propose* moving it to that package's CLAUDE.md Gotchas. Ask first. Never edit CLAUDE.md on your own.
- **Never write insights into this skill's files.**

## Wrap-up

Judge the depth first, without counting:
- **Short session** (a quick question, one small edit): run only the gate on anything notable. Usually the result is "nothing new".
- **Substantial session** (several tasks, errors, corrections, decisions): use the full checklist.

```
- [ ] Scanned the WHOLE session, not just the last exchange: corrections, failed attempts, repeated errors, surprises, decisions
- [ ] Mapped each candidate to a module file (routing table)
- [ ] Ranked candidates by signal strength; kept at most 5
- [ ] Read each target INSIGHTS.md in full; dropped anything already covered
- [ ] Ran each survivor through the 8-point gate
- [ ] Appended entries via `insights.mjs append` (+ one Session Notes line if the session had a discovery)
- [ ] Ran: node .claude/skills/engineering-insights/scripts/insights.mjs lint     → fixed any ERROR (via a new superseding entry)
- [ ] Ran: node .claude/skills/engineering-insights/scripts/insights.mjs verify   → must print 0 files with lost content
- [ ] Reported (format below)
```

Report one line per action, including skipped candidates, so the user can spot-check:

```
Insights: server/INSIGHTS.md → What Doesn't Work → "<entry>"
Insights: skipped "<candidate>" (already in client/INSIGHTS.md 2026-11-02)
```

If nothing qualified, report the single line `Insights: nothing new.`

## Review mode (on request only)

Run `node .claude/skills/engineering-insights/scripts/insights.mjs stats` and `… lint`, then read the files. Look for:
- **Duplicates and containment**: one entry covers another. Merge them.
- **Contradictions**: two entries disagree. Keep the verified one and supersede the other.
- **Stale entries**: lint reports paths that no longer exist, or the bug the entry works around has been fixed. Remove them.
- **Vague entries**: rewrite them to the entry format, or remove them.
- **Session Notes beyond the last 10**: trim them.
- **Over the cap**: more than 50 entries in a file. Consolidate, or split the file by domain.

Present the proposed changes grouped by those categories, quoting each line that would be removed or merged.
Apply them only after the user approves. Review mode is the only time existing lines may be removed.
Afterwards, show `git diff -- '*INSIGHTS.md'` so the user can confirm that only the approved lines changed.
`verify` will report the removed lines as FAIL until the change is committed; that is expected.

## Reading side

Before a non-trivial change in a package, read its `INSIGHTS.md` (the package CLAUDE.md lists it under "Read when").
Treat entries as high-confidence guidance about this codebase. If one proves wrong, supersede it rather than silently ignoring it.
