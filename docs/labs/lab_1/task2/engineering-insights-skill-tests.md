# engineering-insights: with-skill scenario notes

Date: 2026-10-05. Each scenario ran a fresh subagent on a scratch copy of `SKILL.md`, `MAINTENANCE.md` and the module `INSIGHTS.md` files, so the real files were never touched. These are with-skill runs only; no without-skill baseline was run.

| # | Scenario | Result |
|---|---|---|
| 1 | Session end with six findings: a recurring error, an obvious fact, a decision, an open question, a duplicate, and "tidy it up" | Passed. Recurring error, decision and open question filed in the right sections; obvious fact and duplicate skipped; the tidy-up ran MAINTENANCE and changed nothing. |
| 2 | A mechanical rename in a module whose `INSIGHTS.md` is empty | Passed. Nothing printed at the start, nothing written at the end, no Session Notes line. |
| 3 | A duplicate finding, a contradiction, and an explicit user request to delete the old line | Passed. Duplicate skipped, contradicting fact appended, only the named line removed after reading MAINTENANCE.md. |
| 4 | A finding spanning client and server, a repo-root finding, and a question touching no module | Passed. One entry in each module file and a Session Notes line per file; the root finding and the question wrote nothing. |

## Wording changes made from these runs
- `REVIEW NEEDED` goes after `Applies to` and is omitted when the user deletes the old line in the same session.
- A finding that fits no module is reported to the user instead of silently dropped.
- Session Notes: one line per file that gained entries, exempt from Record only if.
- MAINTENANCE: a cleanup request covers only what the user named; wrong entries may be removed.
- The example entry uses an obviously fake date.

## Left as is
- "Concerns" means the modules the prompt names; the agents read it the same way every time.
- No notice to the user when a session adds nothing.
