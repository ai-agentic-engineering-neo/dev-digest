# Agent prompts

## Review agent (one per skill; `Agent`, general-purpose, `model: sonnet`, all launched in ONE message)

```
You are reviewing a pending pull request against ONE project skill.
1. Read <SKILL_PATH> fully (and its references only if a finding needs them).
2. Read <SEVERITY_PATH>.
3. Review ONLY the changed lines of these files (diff below); read surrounding code for context, but do not report pre-existing issues:
   <FILES>
   <DIFF per file: git diff $(git merge-base main HEAD) -- <file>; for untracked files, the whole file>
4. Report only violations of THIS skill's rules. Do not edit any file.
Return ONLY a JSON array (no prose), [] if nothing:
[{"skill":"<name>","severity":"critical|major|minor","file":"...","line":N,"rule":"<short rule id/title from the skill>","problem":"...","scenario":"...","fix":"..."}]
```
Split into several agents by file when a skill's diff exceeds ~1500 lines.

## Verify agent (one per LLM-produced critical; `model: sonnet`)

```
Another reviewer claims this CRITICAL issue:
<finding JSON>
Read the code at file:line and its callers. Try to REFUTE it: is the scenario actually reachable, is the input untrusted, is there a guard elsewhere?
Return ONLY JSON: {"confirmed": true|false, "reason": "..."}
Confirm only if you can state a concrete reachable scenario.
```
Refuted → downgrade to major, append " (unconfirmed critical)" to `problem`.
