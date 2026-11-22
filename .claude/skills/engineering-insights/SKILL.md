---
name: engineering-insights
description: "Reads and maintains per-module INSIGHTS.md files (client, server, reviewer-core, e2e). Use at the START of every session, right after the user's first request and before answering or editing, to load the insights for the module being worked on or discussed. Use again at the END of a session, or on 'wrap up', 'log this', 'remember this', 'what did we learn', or when you hit something that a future agent would know to record only new, substantive learnings in 7 sections: what works, what doesn't, codebase patterns, tool quirks, recurring errors, session notes, open questions. `review` mode audits a file for duplicates, conflicts and stale entries."
---

# Engineering Insights

A learnings loop: **read** the module's `INSIGHTS.md` before working, **collect** candidates while working, **write** only what is new and substantive at the end. Files: `<pkg>/INSIGHTS.md` for `client`, `server`, `reviewer-core`, `e2e`. Skeleton in `template.md`, examples in `examples.md`.

## Phase 1: READ (before the first answer)

1. Work out the module(s) from the paths or feature area in the request. Unsure → read every file that might apply (they are small).
2. Read `<pkg>/INSIGHTS.md`, plus root `INSIGHTS.md` if it exists.
3. State 1–3 points that matter for this task, or "no relevant insights". This proves the file was processed.
4. Treat entries as high-confidence guidance. If the code contradicts one, the code wins and the conflict becomes a candidate for Phase 3.

## Phase 2: COLLECT (during work)

Keep a mental list of candidates, each tagged with section + module. **Write nothing yet.**

Signals, strongest first:

1. The user corrected you
2. An approach failed and you switched
3. An error appeared and you fixed it
4. A cause was not obvious
5. A library or CLI behaved unexpectedly
6. You found a convention not visible in one file
7. Something stayed unresolved

| Section | Put here |
|---|---|
| What Works | Approach that succeeded after alternatives were weighed or tried |
| What Doesn't Work | Dead end or antipattern, with the reason. Most valuable and most often skipped — log it |
| Codebase Patterns | Conventions, architecture decisions |
| Tool & Library Notes | Dependency/CLI quirks, versions |
| Recurring Errors & Fixes | Exact error text, cause, fix |
| Session Notes | Written in Phase 3 only: dated summary of what was added |
| Open Questions | Unresolved items and where to look next |

## Phase 3: WRITE (end of session, or on "wrap up" / "log this")

Copy and track:

```
- [ ] 1. Gate: trivial session (typo, config tweak, Q&A with nothing new)? → say "No new insights." and stop
- [ ] 2. Re-read target file(s)
- [ ] 3. Quality gate on each candidate
- [ ] 4. Dedup against INSIGHTS.md and both CLAUDE.md files (root + package)
- [ ] 5. Conflicts: mark old entry superseded
- [ ] 6. Append (max 5 entries) + Session Note
- [ ] 7. Close answered Open Questions
- [ ] 8. Report
```

**Quality gate** — every condition must hold, else drop the candidate:

- Not obvious to someone reading the code
- Not general knowledge from official docs
- Not a one-off or transient problem (network blip)
- A fresh agent can act on it "cold", without follow-up questions
- Names something concrete: file, symbol, command, number, error string
- At most 2 sentences (a paragraph is documentation, not an insight)
- Would save more than 5 minutes next time

**Dedup**: same meaning in different words → drop. Partly covered → extend the existing entry in place; don't add a second one.

**Conflict**: never delete silently. Keep the old line as `~~old~~ (superseded YYYY-MM-DD: <what changed>)`, then add the new entry.

**Nothing survives** → write nothing, not even a Session Note.

**Otherwise**: append each entry at the end of its section (newest last). Add `### YYYY-MM-DD — <task>` under Session Notes with 1–3 bullets summarizing what was added. Tick answered Open Questions (`- [x]`) and move the answer to its proper section.

**Report**, one line per item:

```
📝 server/INSIGHTS.md § Tool & Library Notes — <entry summary>
Skipped: <candidate> (already documented)
```

## Routing

- About `client/**`, `server/**`, `reviewer-core/**`, `e2e/**` → that package's `INSIGHTS.md`
- Spans packages (e.g. `vendor/shared` drift) → each affected file; note in each copy that it also lives in the other
- Repo-wide (`scripts/`, root `docker-compose.yml`) → root `INSIGHTS.md`, created from `template.md` on first use

## Entry format

- Default: `- YYYY-MM-DD — <claim> — <why / what to do> (\`path\` · \`symbol\`)`
- Recurring Errors & Fixes: ``- YYYY-MM-DD — `<error text>` — cause: … — fix: …``
- Open Questions: `- [ ] YYYY-MM-DD — <question> — look at: …`
- Cite path + symbol, **never line numbers** (they drift).
- Lead with the fact, then why. Use NEVER/ALWAYS only when the rule is absolute.

Bad vs good (full set in `examples.md`):

- ❌ "Promises can be tricky" — noise, not a lesson
- ✅ "`Promise.all()` on the ingest pipeline times out after 30 items — use `Promise.allSettled()` in batches of 10"

## Review mode (`/engineering-insights review [pkg]`)

1. Read the file; print entry counts per section.
2. List: duplicates, contradictions, vague entries ("be careful with…"), workarounds whose bug is fixed, entries pointing at code that no longer exists.
3. Mark doubtful entries `[REVIEW NEEDED]`.
4. Change the file only after the user confirms.
5. Suggest running this when a file passes ~150 entries (signal drops past ~200; consider splitting by domain).

## When NOT to use

- Code design rationale → comments or `docs/`
- Active bugs → issue tracker
- Feature specs → `specs/`

## Gotchas

- Never write learnings into this `SKILL.md`.
- Check `CLAUDE.md` first — many gotchas (migrations on boot, shims, vendor drift) are already there; don't duplicate.
- Files are append-only drafts under human review in git. Don't rewrite others' entries in bulk; use review mode.
- Never write secrets, tokens or keys.
- Pre-existing flat-list bullets are fine as is; don't reformat them during a normal write.
