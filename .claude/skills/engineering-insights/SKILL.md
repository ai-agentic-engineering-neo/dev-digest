---
name: engineering-insights
description: Records non-obvious engineering insights into the INSIGHTS.md of the module where the work happened. Use when a fix needed more than one attempt, a library or tool behaved unexpectedly, an approach turned out to be a dead end, a decision was made for a specific reason, or when wrapping up a task or session.
---

1. Pick the file by the paths you touched: `client/` → `client/INSIGHTS.md`;
   `server/src/modules/repo-intel/` → its `INSIGHTS.md`; other `server/` → `server/INSIGHTS.md`;
   `reviewer-core/` → `reviewer-core/INSIGHTS.md`; `e2e/` → `e2e/INSIGHTS.md`.
2. Record only what a reader of the code would NOT know. Each entry must be actionable
   cold: what to do, where (`file:line`), and why. "Be careful with async" is noise.
3. ALWAYS read the whole target file before writing. If the insight (or the same idea in
   other words) is already there, do not write it again; extend an entry only with a genuinely new fact.
4. Append under the matching section as `- YYYY-MM-DD — <insight> (<file:line>)`, in English;
   add one dated line under Session Notes. Do not skip What Doesn't Work.
5. Never edit or delete existing entries; correct with a new entry "Supersedes YYYY-MM-DD: …".
6. Never record secrets, tokens, or personal data.
7. Write only significant insights. Routine work, or nothing new beyond what the file already
   says → write nothing (not even a Session Notes line) and say so in one sentence.
