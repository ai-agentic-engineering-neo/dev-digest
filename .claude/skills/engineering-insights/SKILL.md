---
name: engineering-insights
description: Reads and maintains the per-module INSIGHTS.md (server/, client/, reviewer-core/, e2e/). Use at the START of every task, right after the user's request, to read the INSIGHTS.md of each module the task concerns before any work; and at the END of the task to append genuinely new, non-obvious learnings (user corrections, dead ends, confirmed fixes, decisions, conventions, library quirks, open questions). Writes nothing when nothing new was learned.
---

# Engineering insights

**Start (required, before any work):** work out which modules the request concerns (server, client, reviewer-core, e2e) and read only their `<module>/INSIGHTS.md`, in full. Name the 1–3 entries that apply to this task, or say "none apply", and follow them as high-confidence guidance.

**End (required check, write only if substantive):**
1. Collect candidates, strongest signal first: user corrections → approaches that failed → errors that recurred or took several attempts → decisions made for a reason → tool/library surprises → questions left unresolved.
2. Keep a candidate only if **all** hold: not obvious from reading the code · would save the next agent 5+ minutes or change what it does · confirmed (an unresolved issue goes to Open Questions instead) · likely to recur, not a one-off or temporary state · not already in AGENTS.md, docs/ or specs/. If nothing survives, write nothing and tell the user "no new insights".
3. Re-read the target `INSIGHTS.md` right before writing. If the insight is already there in any wording, drop it. If an existing bullet is now wrong, add `- YYYY-MM-DD · CORRECTION: …` directly below it.
4. **Never overwrite or rewrite the file.** Existing text is never edited, reordered, reformatted or deleted. Procedure:
   - `.claude/skills/engineering-insights/scripts/append-guard.sh snapshot <module>/INSIGHTS.md`
   - Insert with the Edit tool only (never Write): `old_string` = the section heading line, `new_string` = that heading + the new bullet on the next line (for a CORRECTION: `old_string` = the bullet being corrected).
   - `.claude/skills/engineering-insights/scripts/append-guard.sh verify <module>/INSIGHTS.md` — on FAIL, restore the listed lines from the snapshot before doing anything else.
5. Write at most 3 bullets per task, each under one section: What Works · What Doesn't Work · Codebase Patterns · Tool & Library Notes · Recurring Errors & Fixes · Session Notes · Open Questions. Don't skip **What Doesn't Work**: dead ends are the most valuable entries.
6. Format: `- YYYY-MM-DD · <ALWAYS/NEVER/do X> because <why> — evidence: path/to/file.ts (symbol)`. Use a path + function/symbol, not a line number (lines drift). Scope the claim to where it was observed; don't generalize from one incident. A cross-cutting insight goes in every module it touches.
   - ❌ "be careful with async" · "grounding is tricky"
   - ✅ "NEVER edit grounding logic in server/src/platform/grounding.ts — it is a re-export shim of reviewer-core, so changes are lost; edit reviewer-core/src/ — evidence: server/src/platform/grounding.ts (re-exports)"
7. Tell the user the exact bullets added and which files they went to, so a human can spot-check them.
