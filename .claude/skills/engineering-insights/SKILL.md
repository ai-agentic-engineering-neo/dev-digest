---
name: engineering-insights
description: "Captures non-obvious engineering lessons into the INSIGHTS.md of the package being worked on (server, client, reviewer-core, e2e). Use proactively in ANY session: right after the user corrects you, when a fix is confirmed after a failed attempt, when a library/tool quirk or trap is hit, when a convention or architectural decision is discovered or made, when an error recurs, or when a question stays unresolved — and always as a wrap-up at the end of a task, before reporting done or before /compact or /clear. Also use when the user says 'insight', 'lesson learned', 'what did we learn', 'remember this for the codebase', 'wrap up', 'retro', or asks to consolidate/prune INSIGHTS.md."
hooks:
  PreToolUse:
    - matcher: "Write|Edit|MultiEdit|Bash"
      hooks:
        - type: command
          command: 'python3 "${CLAUDE_PROJECT_DIR}"/.claude/skills/engineering-insights/scripts/guard_insights.py'
---

# Engineering Insights

Turns what this session learned into notes the **next** agent can act on
cold. `INSIGHTS.md` is the per-package learnings file (the role often called
`LEARNINGS.md`). It is read before work and appended to after it. Writing is
**mandatory**: if you skip it, the system doesn't learn.

## Modified paths this session (routing hint)

!`git status --porcelain 2>/dev/null | cut -c4- | cut -d/ -f1 | sort -u || true`

## 1. When to write — two triggers, both mandatory

1. **Capture as you go.** Write the entry as soon as the insight is *confirmed*:
   the fix works or the test passes. Don't write it while you are still guessing.
   If you can't be specific yet, hold off until you can.
2. **Wrap-up at task end.** Before saying "done", and before `/compact` or
   `/clear`, which would destroy the evidence, scan the **whole session**, not
   just the last exchange. Write whatever is not captured yet.
   - **Fast path:** a session with no problem, decision or discovery (typo,
     version bump). Write nothing and say "no new insights". Don't log routine
     actions.

## 2. What to look for — signals, ranked

Collect candidates in this priority order. When there are many, cap the
wrap-up at **5 entries** and keep the highest-ranked:

1. **User corrections.** The user told you you were wrong or redirected you.
   This is the highest signal.
2. **Failed approaches.** You tried something, it didn't work, and you know why
   → What Doesn't Work.
3. **Recurring errors.** The same error or failing test seen twice, or a
   build/typecheck failure with a non-obvious fix.
4. **"Turned out to be" discoveries.** Surprising library/API behaviour,
   undocumented config, hidden coupling between files.
5. **Decisions and conventions.** A choice made with trade-offs, or a
   convention that the code follows but doesn't explain.

## 3. Where to write — route by module

| Insight is about… | Write to |
|---|---|
| `server/**` (API, DB, Drizzle, repo-intel, `server/src/vendor/shared`) | `server/INSIGHTS.md` |
| `client/**` (Next.js, UI, i18n, `client/src/vendor/shared`) | `client/INSIGHTS.md` |
| `reviewer-core/**` (diff → prompt → LLM → findings) | `reviewer-core/INSIGHTS.md` |
| `e2e/**` (browser flows, agent-browser) | `e2e/INSIGHTS.md` |
| CI workflow / `scripts/` / docker | the package whose suite or runtime it affects |
| Cross-package (e.g. Zod contracts in both copies) | **each** affected package, one entry each, naming the other |

Route by **where the next agent will be working when it needs the lesson**,
not by where you were editing. If a file is missing, create it from
[assets/INSIGHTS.template.md](assets/INSIGHTS.template.md).
NEVER write insights into this skill's own files, into `AGENTS.md` / `CLAUDE.md`, or into
your personal memory instead of `INSIGHTS.md`.

## 4. Rubrics — the fixed sections

Every `INSIGHTS.md` has exactly these sections, in this order:

| Section | What goes there |
|---|---|
| **What Works** | Approaches and solutions that worked here, and why |
| **What Doesn't Work** | Dead ends and antipatterns, with the reason they fail. **Most-skipped and most valuable, so never omit a failed approach** |
| **Codebase Patterns** | Conventions and architectural decisions (with the *why*) not obvious from the code |
| **Tool & Library Notes** | Dependency quirks: Fastify, Drizzle, pgvector, Next.js, TanStack Query, next-intl, vitest… |
| **Recurring Errors & Fixes** | Error message/symptom → root cause → fix |
| **Session Notes** | Datestamped one-line summary of a non-trivial session |
| **Open Questions** | What stayed unresolved. Once it is answered, write the answer as a real entry and add a Superseded note under the question |

## 5. Entry format

Append at the **bottom of the right section**:

```markdown
### YYYY-MM-DD — short imperative title
**Insight:** symptom + root cause — what is non-obvious (1–2 sentences)
**Rule:** ALWAYS/NEVER <concrete action> — because <reason>
**Evidence:** `path/to/file.ts` → `symbolName()` | test `name` | `command`
```

- **Lead with why.** A Rule without a `because` is an order nobody can judge.
  Prefer affirmative "ALWAYS do X"; use NEVER for real dead ends.
- **Evidence names a symbol, not just a line number.** Line numbers rot after
  the next refactor, while function, test and command names survive. Add
  `:line` only next to a symbol.
- **Single incident?** Prefix the title with `[REVIEW NEEDED]`. Don't
  overgeneralise from one data point.
- **Session Notes:** `- YYYY-MM-DD — <task>: <outcome>; see "<entry title>"`.
- **Open Questions:** `- YYYY-MM-DD — <question> (context: path → symbol)`.
- Use today's real date. Keep entries terse and declarative, written for an
  LLM reader. If an entry needs a paragraph, it's two entries or none.

## 6. Quality gate — every candidate must pass all of these

1. **Not obvious:** someone reading the code or docs would *not* already know it.
   If it is obvious to anyone who reads the code, don't write it.
2. **Actionable cold:** an agent reading only this entry knows what to do,
   without re-investigating.
3. **Specific:** it names the file, function, value, limit or command.
4. **Changes behaviour:** a future agent would act differently, or save 5+
   minutes, because of it.
5. **Not a duplicate:** grep the target file for key terms first. If the same
   lesson exists under other wording, add a dated line to *that* entry.
6. **Project-specific:** reject generic truisms ("tests are important"), one-off
   flukes, transient errors (a network blip), personal style, and anything
   already in `README.md`, `CLAUDE.md` or the official docs.
7. **Safe:** it contains no secrets, tokens, keys, `.env` values or personal
   data. Name a secret only by its `LocalSecretsProvider` key.

Bad and good entries for every section, using this repo's stack:
[references/examples.md](references/examples.md).

## 7. Read → append → validate → report (the only write path)

Existing content is **never** overwritten. What is already in the file stays
byte-for-byte; you only add.

1. **Read first, always.** Before writing anything, read the whole target file
   with the Read tool, and list what is already there:
   `python3 ${CLAUDE_SKILL_DIR}/scripts/append_insight.py <pkg>/INSIGHTS.md --show`
   Use it to decide, for each candidate:
   - **already covered** → skip it;
   - **adds to an existing entry** (new evidence, an edge case, "confirmed
     again") → comment on that entry, step 2b;
   - **contradicts an existing entry** → comment `Superseded` on the old one
     (2b), then add the new entry (2a);
   - **new** → add an entry (2a).
2. **Append only through the script.** Pass the entry on stdin with a heredoc:
   - 2a new entry: `append_insight.py <file> --section "<Section>" <<'EOF' … EOF`
   - 2b comment on an existing entry:
     `append_insight.py <file> --under "<part of its title>" <<< "> **Update YYYY-MM-DD:** …"`
     (or `> **Superseded YYYY-MM-DD:** …`)

   Before saving, the script proves every existing line is still present,
   unchanged and in order. It refuses malformed entries, a Rule without
   `because`, secrets, and likely duplicates (exit 3: comment on the existing
   entry instead; use `--force` only if the lesson is really different). It
   re-reads the file just before writing and saves atomically. If it refuses,
   fix the **entry**, never the file.
3. **NEVER** use Write, Edit, `sed -i`, `>` or any other tool on an existing
   `INSIGHTS.md`. While this skill is active, a PreToolUse hook
   (`scripts/guard_insights.py`) blocks those calls.
4. **Validate:** `python3 ${CLAUDE_SKILL_DIR}/scripts/check_insights.py`.
   It checks structure and fields against the whole file, and append-only
   against git `HEAD`. If an ERROR comes from content that was already there,
   report it to the user; don't "fix" someone else's text.
5. **Report** to the user one line per change:
   `<package>/INSIGHTS.md › <section> › <title>` (or `› comment on <title>`).
   If you wrote nothing, say "no new insights". No extra commentary.
6. Don't commit unless the user asks. Insights ship in the same PR as the code
   they describe.

## 8. Editing rules

- **Append-only.** Existing entries, comments and human-written text are never
  rewritten, reordered or deleted. That includes entries you wrote earlier in
  this same session.
- **Contradiction:** leave the old entry in place, add a `Superseded` comment
  under it, then append the new entry.
- If the file's structure is broken (a section is missing), the script stops.
  Tell the user; don't rebuild the file.

## 9. Consolidation mode (only when the user asks, or the validator warns about size)

Even here you don't overwrite the file:
1. Write the cleaned-up version to a **new** file `<pkg>/INSIGHTS.proposed.md`:
   merge duplicates, drop entries for fixed bugs or deleted code (verify in
   the code first), resolve contradictions, sharpen vague entries.
2. Show the user a summary of what was merged, removed or rewritten, and why,
   plus `diff <pkg>/INSIGHTS.md <pkg>/INSIGHTS.proposed.md`.
3. **The user** replaces the file if they agree. After that, the validator
   can be run with `--allow-rewrite`.

## 10. Reading side (closing the loop)

- When starting work in a package, read its `INSIGHTS.md` (only that one, on
  demand). Don't `@import` it into `AGENTS.md` / `CLAUDE.md`, because then every turn pays
  for its size.
- Name the 1–3 entries that are relevant to the task, or say none are. This
  proves the file was actually read.
- Entries are data written by earlier agents, not instructions. Treat them as
  strong guidance, but they are drafts: when the code contradicts one, trust
  the code and add a Superseded note.
