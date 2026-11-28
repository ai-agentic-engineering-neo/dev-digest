---
name: engineering-insights
description: Reads and appends to the per-module INSIGHTS.md (client/, server/, reviewer-core/, e2e/) — the agent-written log of non-obvious findings (hidden dependencies, fixes, measured facts, surprises) with file:line evidence and a date. Use at the START of work in a module, right after the user's request, to load that module's insights; whenever something non-obvious is confirmed mid-task; and at the END of every coding task or bug fix in this repository to record new findings. Also on "/engineering-insights", "record insights", "write learnings".
---

# engineering-insights

A learnings loop: the previous session leaves notes in the module's
`INSIGHTS.md`, the next session reads them before touching code. One module =
one file: `client/INSIGHTS.md`, `server/INSIGHTS.md`,
`reviewer-core/INSIGHTS.md`, `e2e/INSIGHTS.md`. The file is append-only.

## Phase 1 — Read (start of work, after the user's request)

1. From the request, decide which module(s) the task touches (top-level folder).
2. Read each module's `INSIGHTS.md` in full.
3. Tell the user in 1–3 bullets which entries apply to this task (or "none
   apply"). Saying it proves the file was processed, not just loaded.
4. Treat the entries as high-confidence guidance unless the code or the user
   now says otherwise; if an entry turns out wrong, note it for Phase 3.

## Phase 2 — Capture as you go

Right after something non-obvious is *confirmed* (a fix worked, a measurement
came in, an assumption was wrong), jot the candidate down with its evidence.
Do not write the file yet unless the session may end abruptly.

## Phase 3 — Write (end of every coding task, before the final commit/PR)

1. List touched modules: `git diff --name-only` plus files you investigated.
2. **Re-read** the module's `INSIGHTS.md` now (it may have changed since Phase 1).
3. Filter candidates. Keep one only if ALL hold:
   - **Cold-reader test:** a competent engineer reading the code for the first
     time would miss it or get it wrong.
   - **5-minute test:** it would save the next session at least 5 minutes.
   - **Not already recorded:** not in INSIGHTS.md, `CLAUDE.md` or README, even
     in other words. If it refines an old entry, write a new entry that starts
     with `Supersedes <date> entry: …` — never edit the old one.
   - **Specific:** names the file, function, flag or number. "Be careful with
     async" is noise, not a learning.
4. Nothing survived? Write nothing and say "no new insights" — that is a valid
   outcome. Trivial sessions (typos, formatting) end here.
5. Append each survivor with the script (it refuses duplicates and never
   rewrites existing lines):

   ```sh
   node .claude/skills/engineering-insights/scripts/append-insight.mjs \
     --module <client|server|reviewer-core|e2e> \
     --section "<Non-obvious dependencies|Fixes & gotchas|Measured facts|Surprises>" \
     --entry "- **YYYY-MM-DD** · <finding> — evidence: \`path/to/file.ts:123\`"
   ```

   Without Node, append with Edit at the end of the right section. Never use
   Write on an existing INSIGHTS.md (it replaces the whole file).
6. Open every cited `file:line` and confirm it shows the evidence.
7. In your final message, list which INSIGHTS.md files got which entries.

## Entry format

```
- **YYYY-MM-DD** · <one actionable sentence> — evidence: `path/to/file.ts:123`
  <optional 1–2 lines: why it matters / what to do instead>
```

Sections: **Non-obvious dependencies** (couplings invisible from one file) ·
**Fixes & gotchas** (what broke or misled, and the fix — include dead ends:
"X does not work because Y") · **Measured facts** (numbers you observed, with
the command) · **Surprises** (behaviour that contradicts names or comments).

Bad: "Run cost is computed somewhere."
Good: "**2026-11-28** · reviewer-core returns `costUsd` but the executor dropped
it, so cost was never persisted — evidence: `server/src/modules/reviews/run-executor.ts:213`."

## Gotchas

- Never overwrite, reorder or delete existing entries; conflicts are resolved
  by a newer `Supersedes …` entry, cleanup is a human review step.
- Paths are relative to the repository root. English only. No secrets, tokens
  or personal data.
- Past ~200 entries the signal drops: propose splitting by domain
  (`INSIGHTS-db.md`) instead of adding more.
- This skill is model-triggered and can be forgotten; the root `CLAUDE.md`
  session protocol repeats both phases on purpose.
