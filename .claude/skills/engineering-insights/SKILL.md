---
name: engineering-insights
description: Reads and maintains the INSIGHTS.md file of the package being worked on (server/, client/, reviewer-core/, e2e/, or the repo root for cross-package work). Use at the start of every task — after the user's request and before reading code — to load the relevant INSIGHTS.md, and again before the final answer of a task to record new, substantial, verified findings (user correction, non-obvious root cause, failed approach, tool/library/environment quirk, trade-off decision, dependency upgrade). Also use when the user says "wrap up", "capture insights", "what did we learn", "запиши інсайти", "підсумуй сесію", or runs /engineering-insights; "/engineering-insights review" audits a file. Writes nothing when nothing new was found.
---

# Engineering insights

Goal: every session starts with what earlier sessions learned about the module and ends by adding only what is genuinely new. An empty write is a valid result.

## 1. Read — start of every task (mandatory)
After the user's request and before reading code or answering:
1. Determine the module from the request: paths mentioned, the feature named, or where the change will go (see Routing).
2. Read that module's `INSIGHTS.md` plus any `INSIGHTS-<domain>.md` next to it that covers the area you will touch; also root `INSIGHTS.md` if the work spans packages.
3. Conflicts: if two relevant entries contradict each other, do not pick one. Check the code or run a test, add a `contradicted` comment under the wrong entry (step 2), and tell the user.
4. Hygiene, once per session, only proposing (never blocking the task):
   - `## Review log` has no entry from the last 30 days and the file has entries older than 30 days → propose `/engineering-insights review`;
   - the file has more than ~50 entries → propose review; more than ~100 → propose splitting it (see Review).
5. Say one line: `Insights read: <file(s)> — <N> relevant` (or `none relevant`). If work later moves to another package, read its files first.
Treat relevant entries as high-confidence guidance unless the user says otherwise; if the code contradicts an entry, the code wins — add a `contradicted` comment in step 2.

## 2. Write — before the final answer of a task (automatic: no approval needed)
1. Scan the task for signals, in priority order:
   1. the user corrected you or rejected an approach;
   2. an error whose root cause was non-obvious (build, test, runtime);
   3. a first approach failed and you switched;
   4. a tool, library, API, or environment behaved unexpectedly;
   5. a decision with a trade-off or a convention the code doesn't state;
   6. a dependency version changed (`package.json` or a lockfile): find entries that mention that library and check they still hold.
2. Re-read the target file now and compare every candidate with what is recorded:
   - not recorded anywhere (INSIGHTS files, AGENTS.md, README) → new entry;
   - an existing entry was confirmed again, needs a detail added, turned out wrong, or is obsolete (e.g. after an upgrade) → comment under that entry (see Comment format);
   - already recorded with nothing to add → drop.
3. Drop every candidate that fails the quality gate. Keep at most 5 new entries + comments in total.
4. Nothing left → write nothing and say `Insights: nothing new.`
5. Otherwise write each one with the insert-only script (see Writing safely), then report one line each: `file → new: <insight>` or `file → comment on "<title>": <comment>`.

## Writing safely — the only allowed way to change INSIGHTS files
```sh
python3 "${CLAUDE_SKILL_DIR}/scripts/insights.py" add <path>/INSIGHTS.md "<Section>" "- YYYY-MM-DD · …"
python3 "${CLAUDE_SKILL_DIR}/scripts/insights.py" comment <path>/INSIGHTS.md "<text unique to the entry>" "YYYY-MM-DD · extended: …"
python3 "${CLAUDE_SKILL_DIR}/scripts/insights.py" init <package>/INSIGHTS-<domain>.md "<package> / <domain>"
```
- `add`/`comment` insert exactly one line, verify every existing line is still there in order, and write atomically; on any doubt the script refuses and leaves the file unchanged. `init` only creates a new domain file and never overwrites.
- Never use Write, Edit, or shell redirects on INSIGHTS files. A project hook (`.claude/hooks/protect-insights.py`) blocks anything that could replace or remove existing text.
- If the script refuses, fix the input (section name, date prefix, a more specific match text) and retry. Never work around the refusal.

## Quality gate — write only if ALL are true
1. It would save a future session 5+ minutes or prevent a wrong change.
2. It is not obvious from reading the code and not already recorded.
3. It is verified (test passed, command ran, fix confirmed). Unverified hunches go to **Open Questions**.
4. It is not general knowledge, a one-off/transient issue (network blip, typo), or a personal style preference.
5. It contains no secrets, tokens, or personal data.
If the finding is a workaround for something fixable (slow test command, broken script), propose the fix to the user instead of only recording it.

## Rubrics → section
| Section | Write when |
|---|---|
| Patterns | an approach worked here and is worth repeating |
| Mistakes | a wrong path or recurring error: symptom → cause → fix |
| Decisions | a choice was made for a non-obvious reason (record the why) |
| Context | a tool, library, API, environment, or data quirk |
| Open Questions | noticed but not resolved |
| Review log | written only by review mode |

## Routing — one file per entry
- `server/` (incl. `src/modules/repo-intel`) → `server/INSIGHTS.md`
- `client/` → `client/INSIGHTS.md` · `reviewer-core/` → `reviewer-core/INSIGHTS.md` · `e2e/` → `e2e/INSIGHTS.md`
- Spans several packages (aliases, shared contracts, dev.sh, CI) → root `INSIGHTS.md`
- If the package has a domain file for the area (e.g. `server/INSIGHTS-repo-intel.md`), write there instead.

## Entry format — ALWAYS use this exact template
```
- YYYY-MM-DD · <insight: concrete names, imperative, max 2 sentences> — <why>. Evidence: `path` (`symbol` or section)
```
Appended at the end of the matching section (newest last). Use today's date. No line numbers — they go stale; name the file plus a symbol, error message, or command.

## Comment format — on an existing entry
An indented sub-bullet directly under the entry (below earlier comments); the entry's own text never changes:
```
  - YYYY-MM-DD · confirmed | extended | contradicted | obsolete | moved: <what this task showed>. Evidence: `path` (`symbol`)
```
- `confirmed`: hit again in a different situation (only if it shows the entry matters more widely).
- `extended`: new detail, case, or fix.
- `contradicted`: the code or a test now disagrees — say what is true now.
- `obsolete`: the underlying issue was fixed or the dependency upgraded — name the fix or version.
- `moved`: copied to a domain file during a split — name the file.

## 3. Review — `/engineering-insights review` (on request or when proposed in step 1.4)
1. Report: duplicates; entries that contradict each other or the current code; entries made obsolete by a fix or a dependency upgrade (compare with current `package.json` versions).
2. Propose actions as a list of exact lines. After the user approves, the agent only adds: `contradicted` / `obsolete` comments via the script. Deleting lines is done by the user by hand (the hook blocks the agent).
3. Split (file > ~100 entries): propose domains (e.g. `repo-intel`, `db`, `reviews`). After approval: `init` the domain file, `add` the entries there (same text), add a `moved` comment under each original; the user then deletes the originals.
4. Finish by appending `- YYYY-MM-DD · reviewed: <N> entries, <M> flagged, <K> moved` to `## Review log` via the script.

## Rules
- Only add — new entries or comments. Never rewrite or delete an entry or a comment; a near-duplicate becomes an `extended` comment, not a new entry.
- Touch only INSIGHTS files. Never edit AGENTS.md, READMEs, or this skill; if an insight has become a permanent rule, propose moving it to AGENTS.md and let the user decide.
- INSIGHTS files are drafts under human review: every write is reported, and changes are reviewed in the PR diff.

## Gotchas
- `e2e/specs/` holds test flows (`*.flow.json`), not insights or feature specs — never write there.
- Write cold: no "this bug", "as above", "the fix we discussed". Name the file, command, or error message.
- One insight per entry; if you need "and also", write two entries.
- A user correction is the strongest signal and the easiest to forget — check for it first.

Good vs bad entries for each section: `references/examples.md`.
