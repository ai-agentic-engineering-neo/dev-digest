---
name: engineering-insights
description: Reads and writes the INSIGHTS.md lessons of the module being worked on (client, server, reviewer-core, e2e, or the repo root for cross-cutting ones). Use at the start of every user request, before any work, to read the relevant module's INSIGHTS.md; during work when a fix works only after a failed attempt, the approach pivots, a library/tool/command behaves unexpectedly, the user corrects the agent, or an error recurs; and at the end of every task to append only new, substantial lessons. Also triggers on "wrap up", "retro", "remember this", "запиши інсайт".
---

# Engineering insights

Goal: next session in this module avoids today's dead ends without re-discovering them.

## Where
Module the request is about or will change: `client/`, `server/` (incl. repo-intel),
`reviewer-core/`, `e2e/` → `<module>/INSIGHTS.md`.
Spans several modules / `scripts/` / docker / root config → `./INSIGHTS.md`.

## 1. Read — before any work, after every new user request
- Identify the module(s) from the prompt; read their INSIGHTS.md in full (+ `./INSIGHTS.md`).
- Do this BEFORE reading code, planning or answering. Module unclear → read root + best guess.
- Apply entries as high-confidence guidance; name the ones that change your approach.

## 2. Write — mid-task (after a fix is CONFIRMED) and at end of task
1. Collect candidates by signal strength: user correction > approach that failed then pivoted
   > tool/library surprise > recurring error > pattern/decision with a reason. Max 5.
2. Re-read the target INSIGHTS.md in full right before writing.
3. Same or equivalent insight already there → drop it. Contradicts an entry → write a
   `supersedes` entry only if you verified the new behaviour; else drop and mention it.
4. Run the quality gate. Nothing left → write nothing; say "no new insights" in one line.
5. Report one line per entry written: file + section + entry; list dropped duplicates.

## Quality gate — drop the candidate if any check fails
1. Obvious to anyone reading the code or docs? → drop.
2. Generic truism ("tests are important", "be careful with async")? → make specific or drop.
3. Unlikely to recur or saves the next session less than ~5 min? → drop.
4. Unresolved (stopped mid-debugging, hypothesis)? → Open Questions at most, never a rule.
5. About code in active flux, or tied to a line number / temp path? → anchor to file + symbol, or drop.
6. Contains secrets, tokens or personal data? → never write.

## Format
Section (exactly one): What Works · What Doesn't Work · Codebase Patterns ·
Tool & Library Notes · Recurring Errors & Fixes · Session Notes (`### YYYY-MM-DD` + 1–3 bullets) · Open Questions
Entry: `- YYYY-MM-DD — <context/trigger> → <what to do instead> (evidence: path#symbol | command)`
One line, max 2 sentences, imperative (lead with Use / NEVER / ALWAYS), names the concrete
file, function or command. Abstract one level up from the incident, keep the concrete fix.

## Append without overwriting — MUST follow exactly
1. Before: `wc -l <file>` → remember N. Read the file in full.
2. NEVER use Write / `>` / `sed -i` / any full-file rewrite on INSIGHTS.md.
   Only Edit: `old_string` = last line of the chosen section (its heading if empty),
   `new_string` = that same line unchanged + newline + new entry.
3. After: `wc -l` must equal N + added lines, and `git diff --numstat <file>` (tracked file)
   must show 0 deleted lines. Otherwise restore the lost lines at once and tell the user.

## Rules
- Append-only: never edit, reorder or delete old entries.
  Old entry is wrong → new dated entry `supersedes YYYY-MM-DD entry: …`.
- Not here: design rationale for one function (→ code comment), active bug tracking (→ issue),
  static conventions everyone must follow (→ CLAUDE.md).
- Good vs bad entries, one per section: [examples.md](examples.md).
