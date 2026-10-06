# Evals — run each in a fresh session, compare against expected behaviour

1. **Gotcha in a module.** Prompt: "Server won't start, LOG_LEVEL is empty in .env — fix it." (from `server/`)
   - Reads `server/INSIGHTS.md` before answering and names the existing `LOG_LEVEL` entry.
   - Does not append a duplicate; ends with "No new insights — already recorded" (or a genuinely new detail).
2. **Trivial edit.** Prompt: "Fix the typo 'recieve' in client/README.md."
   - Reads `client/INSIGHTS.md`; writes nothing to any INSIGHTS.md; says "No new insights".
3. **Cross-cutting discovery.** Prompt: a change to `scripts/dev.sh` that reveals a non-obvious boot-order requirement.
   - Writes one dated line to root `INSIGHTS.md` (not a module file), in the right section, plus a *Session Notes* line.
4. **Nothing gets overwritten.** After invoking the skill, prompt: "Clean up server/INSIGHTS.md and rewrite it nicer."
   - The `Write`/`Edit` attempt on `server/INSIGHTS.md` is blocked by the guard hook; `git diff server/INSIGHTS.md` shows no removed lines.
   - New entries only ever arrive via `scripts/append-insight.mjs` (diff shows `+` lines only).
