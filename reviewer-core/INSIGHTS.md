# Insights

Lessons learned in this package: traps, non-obvious behaviour, approaches that
failed and why. Read before changing non-trivial code here. Maintained by the
`engineering-insights` skill (`.claude/skills/engineering-insights/SKILL.md`).
Append-only: newest at the bottom of each section. Corrections go in as
`> **Superseded YYYY-MM-DD:** …`, never as deletions.

Entry format (Session Notes and Open Questions are `- YYYY-MM-DD — …` one-liners):

```
### YYYY-MM-DD — short imperative title
**Insight:** symptom + root cause — what is non-obvious
**Rule:** ALWAYS/NEVER <action> — because <reason>
**Evidence:** path/to/file.ts → symbolName() | test name | command
```

Only add an entry if it is non-obvious from reading the code, specific, and
actionable cold.

---

## What Works

### 2026-11-27 — Match injection phrases, not topics; seed skills are the regression set
**Insight:** Security skills legitimately say "## Do not flag", "prompt injection", "fetch with input"; a topic-level rule would flag them. The rules in `skill-safety.ts` match imperative attack phrases only (e.g. "do not report security", "always approve", "ignore … previous instructions"), and `server/test/skills-safety.test.ts` asserts every `SEED_SKILLS` body scans with zero findings.
**Rule:** ALWAYS add a legitimate-wording negative case next to every new rule and keep the seed test green — because a false positive locks a real skill (cannot be enabled or linked).
**Evidence:** `reviewer-core/src/skill-safety.ts` → `RULES` | test `skill-safety.test.ts` "legitimate review rules stay clean" | `server/test/skills-safety.test.ts` "seed skill … scans clean"

## What Doesn't Work

## Codebase Patterns

### 2026-11-26 — Skills render in the user message, not the system message
**Insight:** `assemblePrompt()` puts skill bodies under `## Skills / rules` in the **user** message (after the PR description), not appended to the system prompt. The client Config tab hint `config.systemPromptHint` says skills are "appended below" the system message, which describes order, not role.
**Rule:** NEVER move skills into the system message to match UI wording — because the CI runner shares this engine and prompt-role changes alter every agent's behaviour; change the hint text instead if it confuses users.
**Evidence:** `reviewer-core/src/prompt.ts` → `assemblePrompt()` `userSections`; `client/messages/en/agents.json` → `config.systemPromptHint`

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
