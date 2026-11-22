---
name: engineering-insights
description: Capture non-obvious engineering findings from a coding session into the insights.md of the module being touched. Use when finishing a task that produced durable knowledge (wrap-up), or mid-session when hitting a non-obvious gotcha, a confusing bug, a library quirk, a reusable pattern, or an architectural decision with a stated reason. Writes append-only, one entry per finding. Trigger terms: insights, LEARNINGS, wrap-up, session notes, gotcha, non-obvious, architecture decision, codebase pattern, library quirk, open question, lesson learned.
---

# engineering-insights

Captures non-obvious engineering findings from a coding session into the correct module's `insights.md`. Append-only, one entry per finding, strict quality bar.

## When to use

Trigger in two modes:

**Capture-as-you-go** — mid-session, as soon as something non-obvious appears:
- a gotcha that cost real time to debug
- a reusable codebase pattern worth naming
- a library or tool quirk not documented in the lib's own docs
- an architectural decision with a stated reason
- an antipattern that fails in a non-obvious way

**Wrap-up** — at the end of a session >30 min that produced a problem, solution, or discovery. Trivial sessions (typo, config bump) are skipped.

## When NOT to use

- Trivial fixes: typos, formatting, dependency bumps without behavior change.
- Findings obvious from reading the code ("async is tricky", "careful with migrations").
- Behavior already captured in a recent commit message, PR description, or CLAUDE.md.
- Rules the linter or typechecker enforces.

**Quality test:** "If this were obvious to anyone reading the code, don't write it." See `rubrics.md` for vague-vs-useful examples.

## Which file to write

Write to the `insights.md` of the module touched by the task:

| Touched code under | Write to |
|---|---|
| `server/` | `server/insights.md` |
| `client/` | `client/insights.md` |
| `reviewer-core/` | `reviewer-core/insights.md` |
| `e2e/` | `e2e/insights.md` |

If a task touched multiple modules, write a focused entry into each — do not aggregate at the repo root.

## The 7 rubrics

Every entry goes into exactly one of these sections (full definitions and examples in `rubrics.md`):

1. **What Works** — a non-obvious approach that succeeded
2. **What Doesn't Work** — antipatterns / dead ends (most often skipped, highest value)
3. **Codebase Patterns** — project-specific conventions
4. **Tool & Library Notes** — quirks of Fastify / Drizzle / TanStack / pgvector / OpenRouter / etc.
5. **Recurring Errors & Fixes** — error + stable fix
6. **Session Notes** — datestamped session summary
7. **Open Questions** — unresolved for future sessions

## Entry format

Use the template in `template.md`. Each entry carries: short title, ISO date, `file:line` evidence, 1–3 sentence body that is actionable "cold" (a future reader knows what to do without more context).

## Append-only — hard rules

Overwriting `insights.md` would destroy durable team knowledge. These rules are non-negotiable:

- **Never use `Write` on `insights.md`.** Only `Edit`. If you cannot find a safe anchor for `Edit`, stop and ask the user — do not fall back to `Write`.
- **Never delete, rephrase, or renumber an existing entry.** The entries are an append-only log.
- **Never merge a new finding into an existing entry.** One entry per finding, always a new block.
- **Never reorder sections** or add/remove the 7 canonical headings.
- To correct a stale entry, add a new dated "Superseded YYYY-MM-DD: …" note **directly below** the original. The original stays byte-for-byte.
- If the target section has existing entries, your addition must appear **after** the last of them, not between them.

## Workflow

When this skill activates:

1. Read `rubrics.md` and `template.md` from this skill folder.
2. Identify which module(s) the current task touched; pick the target `insights.md` path(s).
3. **Read the full target `insights.md` file** before drafting. This serves three purposes: verify the 7-section structure is intact; see what's already there (don't duplicate); identify safe anchor strings for `Edit`.
4. For each candidate finding, apply the quality test (see `rubrics.md`). Drop anything that fails. Also drop anything that duplicates or trivially restates an existing entry.
5. Draft entries using the template format. Pick the right rubric per entry.
6. Show the user the proposed entries **and the target file(s) with anchor context** (3 lines above and below each insertion point). Get explicit approval.
7. On approval, use `Edit` with these constraints:
   - **Anchor strategy:** pick an `old_string` that is unambiguous — the last existing entry in the section plus the next `## ` heading (or end-of-file). A bare `## <Section Name>\n` is NOT safe when the section is empty, because any adjacent empty section header has the same shape.
   - **For a currently empty section:** `old_string` must include the section heading plus the next section heading (or the file's trailing `\n` if it's the last section). `new_string` is the same, with the new entry inserted between them, preceded by a blank line.
   - **For a non-empty section:** `old_string` must end with the last existing entry and extend up to (but not including) the next `## ` heading. Append the new entry between.
   - **One entry per `Edit` call.** Do not batch — easier to diff, easier to abort.
8. **Post-write verification:** immediately `Read` the file again and confirm (a) all 7 section headings are present in order, (b) every pre-existing entry is still present verbatim, (c) the new entry appears exactly once. If any check fails, stop and alert the user — do not attempt auto-recovery.

## Hygiene

- Soft limit: ~200 entries per file. If exceeded, propose splitting by sub-domain (`insights-auth.md`, `insights-ingest.md`) rather than letting the file grow.
- Quarterly: propose a review pass to mark obsolete entries as "Superseded" (keep the history, don't hard-delete).
- `insights.md` is a reviewed draft, not ground truth. The human spot-checks every wrap-up.
