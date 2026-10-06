---
name: engineering-insights
description: Reads and records non-obvious engineering insights in the INSIGHTS.md of the module a task concerns. Use at the start of every task, before answering, to read that module's insights; as you go when something surprising happens (a user correction, a gotcha that cost time, a dead end, a root cause, an env/dependency requirement, a decision with a reason); and at the end of the session to record only what is new and substantial. Also triggers on "/engineering-insights", "add to insights", "wrap up", "what did we learn", "anything learned?".
allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/scripts/append-insight.mjs *)
hooks:
  PreToolUse:
    - matcher: "Write|Edit"
      hooks:
        - type: command
          command: "node \"${CLAUDE_PROJECT_DIR}/.claude/skills/engineering-insights/scripts/guard-insights.mjs\""
---

# Engineering Insights

1. **Start — read before answering:** read the whole `INSIGHTS.md` of every module the prompt concerns (`server/`, `client/`, `reviewer-core/`, `e2e/`; root `INSIGHTS.md` for cross-module, `scripts/`, `docs/`) — a module's CLAUDE.md is not loaded until you touch its files. Say in one line which file you read and which entries apply (or "none relevant"), then treat them as high-confidence guidance unless the user says otherwise.
2. **Capture as you go:** highest signal first — user corrections, then gotchas that cost real time, dead ends, env/dependency requirements, decisions whose reason isn't visible in code.
3. **Apply the bar — all three must hold:** not obvious from the code, README, `docs/` or CLAUDE.md; will recur (stable, not code in flux); changes what the next agent does. Most sessions produce nothing — never invent insights. See [examples.md](examples.md).
4. **Re-read the target before writing:** already there (even reworded) → skip; contradicts an entry → append the new one with `(supersedes: <old>)` and tell the user; the same problem keeps recurring → also propose turning it into a CLAUDE.md rule, test or check.
5. **Write — append only, via the script, never with Write/Edit** (a hook blocks those on `INSIGHTS*.md`):
   `node ${CLAUDE_SKILL_DIR}/scripts/append-insight.mjs <module>/INSIGHTS.md "<Section>" "- YYYY-MM-DD — <specific what> → <what to do / why> (<file:line | commit>)"`
   It inserts one line at the end of one of the 7 sections, skips duplicates, and refuses if any existing line would change. Actionable cold. Pruning/merging old entries is a human's monthly review, never yours.
6. **End of session — mandatory check** (wrap-up after any substantive session — a problem, a fix or a discovery; trivial config/typo edits → skip): walk the 7 sections as a checklist (don't skip *What Doesn't Work*); record at most 5 insights, plus one *Session Notes* line only if you recorded something. Nothing new → write nothing.
7. **Report:** end your reply with what you recorded and where, and what you considered but rejected (one line each) — or "No new insights — <one-line why>". It is a draft for human review.
8. **Never** write secrets, a chat replay, a summary of the change (that's the commit message), or insights into this skill's own files.
