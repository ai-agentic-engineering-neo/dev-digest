---
name: engineering-insights
description: "Reads and updates a module's INSIGHTS.md — the append-only log of non-obvious findings (what works, what doesn't, patterns, gotchas, open questions) for server/, client/, reviewer-core/, or e2e/. Use at the start of any task touching one of these modules, before writing code, to load prior findings. Use again at the end of a substantive session to record anything new. Trigger terms: INSIGHTS.md, session findings, wrap up, note this, gotcha, worth remembering."
metadata:
  tags: insights, learnings, session-start, wrap-up, documentation
---

**Start of a task touching a module:** read that module's `INSIGHTS.md`
first and note what's relevant before doing any work — don't re-derive
something already recorded there.

**End of a substantive session** (a real problem solved, a decision made, a
surprise hit — not a trivial edit): re-read the file again right before
writing. If the finding isn't already there, insert one dated bullet
(`**YYYY-MM-DD** — <specific, actionable finding>. Evidence: \`path:line\`.`)
directly under the one existing heading it fits, placed after that
section's last entry — never a new heading. Nothing substantive happened →
write nothing.

**Never regenerate or overwrite the file.** Only ever insert a new line;
every existing character — every prior entry, in every section — must come
out identical to how it went in. Never edit or delete a prior entry to
"fix" it — correct it with a new dated line instead. A finding that should
hold true *always* belongs in that module's `CLAUDE.md`, not here.
