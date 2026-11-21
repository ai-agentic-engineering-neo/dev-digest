---
name: engineering-insights
description: Reads the touched module's INSIGHTS.md before work starts and records significant new engineering insights in it when a task ends. Use at the start of any task in client/, server/, reviewer-core/ or e2e/ (read), and at the end of a task or whenever a gotcha, failed approach, user correction, decision with a reason, or dependency quirk surfaced (write). Also invoked manually via /engineering-insights.
---

# Engineering Insights

Module memory = `<module>/INSIGHTS.md` (client, server, reviewer-core, e2e; repo-intel → server; cross-module → root INSIGHTS.md).
Same read → write cycle whether triggered automatically by the description or manually via /engineering-insights. Never ask the user for approval; report what was added.

## 1. Read — before any work
1. Identify the module from the user's prompt and the files involved.
2. Read its INSIGHTS.md (and the root one for cross-module topics). Treat entries as high-confidence guidance.
3. Name the 2–3 entries most relevant to this task. File missing or empty → say so in one line and continue.

## 2. Write — end of task
1. Re-read the module's INSIGHTS.md.
2. Collect up to 5 candidates, strongest signal first: user correction > failed approach/workaround > unexpected library or API behaviour > decision with a reason > repeated pattern.
3. Keep a candidate only if ALL hold: saves someone 5+ minutes next time · not inferable from code or docs · likely to recur · still true after this change.
4. Already recorded (same meaning, other words)? Skip it. If the task confirmed, contradicted or outdated an entry you read in step 1, add a dated comment under it (`  - YYYY-MM-DD confirmed|contradicted|stale: <why>`); never edit the entry itself.
5. Nothing survives → write nothing and say "No new insights for <module>."
6. Otherwise add at the TOP, one lesson per entry, ≤2 sentences:
   `- **[Pattern|Mistake|Decision|Context] Title.** what happened → what to do. (YYYY-MM-DD, path/symbol)`
7. SAFE WRITE — INSIGHTS.md is append-only, existing text is never lost:
   - Use the Edit tool to INSERT text, anchored on the header block (the first line after the intro paragraph). Never use Write on an existing file; Write is only for creating a missing file.
   - Re-read the file right before editing (it may have changed since step 1) and keep a copy of its lines in mind.
   - After editing, re-read it: every pre-existing line must still be present, unchanged and in the same order. If anything is missing, restore it immediately and tell the user.
   - Never rewrite, reorder, reformat, merge or delete existing entries. Duplicates or stale entries → mention them in the report (and in a dated comment), the user decides.
   - Only exception: the template line `_(empty — add the first entry …)_` may be replaced by the first entry.
8. Report the added entries verbatim so the user can review or revert them in the diff.

## Gotchas
- Never overwrite, truncate or reformat INSIGHTS.md. Insert only (Edit), verify after.
- Never record secrets, tokens, client names/data or personal data.
- No line numbers, temp paths or generic advice ("be careful with async").
- Write positively with the reason ("use X because …") and name the concrete file/symbol.

Examples: [examples.md](examples.md)
