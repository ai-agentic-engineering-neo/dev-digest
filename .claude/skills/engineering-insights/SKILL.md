---
name: engineering-insights
description: Reads and maintains DevDigest's per-module INSIGHTS.md files — non-obvious, evidence-backed facts about a module that its code doesn't show. Use at the start of every task, right after the user's prompt, to read the INSIGHTS.md of each module the task concerns; whenever something non-obvious surfaces mid-task (a user correction, a dead end, a workaround, an error with a non-obvious fix, docs that contradict the code, a dependency quirk, a decision and its reason); and before finishing a task, to append only new, deduplicated insights. Also use when asked to "wrap up", "record insights", "what did we learn", or what is known about a module.
---

# Engineering insights

Every module keeps an `INSIGHTS.md` of facts that are true about it but not
visible in its code. Read the file before you work in a module; add to it only
what the next session would otherwise have to rediscover. The files are
append-only: what is already written is never changed.

## Which file

| The task concerns                                          | File                                        |
| ---------------------------------------------------------- | ------------------------------------------- |
| `server/src/modules/repo-intel/**`                         | `server/src/modules/repo-intel/INSIGHTS.md` |
| `server/**` (everything else)                              | `server/INSIGHTS.md`                        |
| `client/**`                                                | `client/INSIGHTS.md`                        |
| `reviewer-core/**`                                         | `reviewer-core/INSIGHTS.md`                 |
| `e2e/**`                                                   | `e2e/INSIGHTS.md`                           |
| 2+ packages, contracts in `vendor/shared`, `scripts/`, `.github/`, `.claude/`, `docs/`, root files | `INSIGHTS.md` |

## Read — right after the user's prompt

Before the first answer or edit, read the file of every module the prompt
concerns and name, in one line, the entries that apply — or say none do.
Treat entries as high-confidence guidance; if the code now disagrees, trust the
code and record the contradiction at wrap-up. When work moves into another
module, read its file before touching it.

## Capture — while working

Keep a running list of candidates. Strongest signals first: a user correction ·
an approach that failed, and why · a workaround · an error whose fix wasn't
obvious · a doc that contradicts the code · a dependency or tool quirk · a
decision and its reason. Write a candidate once it is verified — a session can
end without a wrap-up.

## Wrap up — before reporting the task done

1. Re-read the target file; it may have changed since you started.
2. Drop a candidate if an entry, the module's `CLAUDE.md` or `README.md` already
   says it; if it's obvious from reading the code; if it's generic knowledge;
   if it won't recur; or if you have no evidence for it.
3. Append each survivor with the script — the only write path. It inserts lines
   and refuses everything else: an unknown section, a missing file, a claim
   already in the file, any change to an existing line. Paths are relative to
   the repo root. (`${CLAUDE_SKILL_DIR}` is this skill's folder,
   `.claude/skills/engineering-insights/`.)

   ```sh
   node "${CLAUDE_SKILL_DIR}/scripts/append-insight.mjs" server/INSIGHTS.md "Doc drift" <<'EOF'
   - **YYYY-MM-DD** — what is true → what to do. Evidence: `path:line`
   EOF
   ```

   One insight per bullet; Doc drift cites both the doc line and the code.
4. New nuance for an existing entry, or an entry that is now wrong: the same
   script with `--under "<text unique to that entry>"`. It lands as an indented
   sub-bullet (`superseded: …` for a wrong one); the old entry stays as is.
5. If you added entries, add one line to Session notes:
   `- **YYYY-MM-DD** — <task>: +N (<sections>)`.
6. Confirm nothing was removed: the script reports `removed 0`, and
   `git diff -U0 -- <file>` shows no `-` lines. If it shows some you didn't
   cause (uncommitted edits by someone else), leave them alone and mention it.
   Then end your reply with `Insights: <file> +N (<sections>)` or
   `Insights: nothing new`. Writing nothing is a normal outcome; skipping the
   check is not.

## Never

- `Write` or `Edit` an existing `INSIGHTS.md`, or reword, reorder, merge, "fix"
  or delete an entry — not even a typo in an old one.
- Work around a refusal from the script. Fix the input, or report it.
- Create a new `INSIGHTS.md` or a new section. Ask the user.

## Sections

- **What works** — approaches that worked here, and why.
- **What doesn't work** — dead ends and anti-patterns. Most often skipped, most valuable.
- **Codebase patterns** — conventions and architecture decisions, with the reason.
- **Tool & library notes** — quirks of dependencies and tooling.
- **Recurring errors & fixes** — the exact error text → the fix.
- **Doc drift** — a doc says X, the code does Y.
- **Session notes** — one dated line per session that added entries.
- **Open questions** — unresolved; needs a human decision.

## Quality bar

An entry must be actionable cold: an agent that reads only that line knows what
to do without re-investigating. If it would be obvious to anyone reading the
code, don't write it.

- ✗ "Promises can be tricky" · ✗ "be careful with the shared types"
- ✓ "`client/src/vendor/shared` lags the server copy and has no sync script →
  diff against `server/src/vendor/shared` before relying on a type."

One ✗/✓ pair per section: [references/examples.md](references/examples.md).

## Gotchas

- `server/clones/**` holds a cloned copy of this repo, `INSIGHTS.md` files
  included — a `**/INSIGHTS.md` glob finds them. Use the paths in the table.
- Record the conclusion, not the story of the session.
- A lesson about tooling everyone trips on (a forgotten flag, a missing script)
  goes in the insights *and* deserves a fix — suggest one.
- Over ~100 entries in a file: say so and propose a consolidation pass for the
  user to do. Don't consolidate or prune yourself.
