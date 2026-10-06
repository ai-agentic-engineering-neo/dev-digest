# References — where each rule comes from (for humans; not loaded by the skill)

| Rule / file | Source |
|---|---|
| 7 fixed sections, "actionable cold", bad/good pairs, append-only, ~200-entry split, draft under review, monthly prune | MindStudio — self-learning-ai-skill-system-learnings-md-wrap-up (via course slides) |
| Start-of-task read + one-line confirmation that it was read | MindStudio — how-to-build-learnings-loop-claude-code-skills; self-learning-claude-code-skill-learnings-md ("summarize the current entries") |
| Bar: specific / reusable / "if it doesn't change behaviour, skip it" | MindStudio — how-to-build-learnings-loop-claude-code-skills |
| Bar: recurrence, inferability, stability, project specificity; avoid code in flux | MindStudio — what-is-claude-code-auto-memory |
| "Bar is high, most sessions produce nothing, don't invent"; 5 qualifying kinds; reject list; "considered but rejected" report | Shpigford/skills — learnings/SKILL.md |
| User corrections rank highest; read target → dedup/conflict → skip; ≤5 candidates; never write into the skill itself; exact content, not titles | glebis/claude-skills — retrospective/SKILL.md |
| Filter "stable, non-obvious, actionable, not documented, still a concern" | tobihagemann/turbo — self-improve |
| Recurring lesson → automate it (rule/test/check) | johnlindquist/claude — skills/lessons |
| "If changes are trivial, say so rather than forcing a lesson" | softaworks/agent-toolkit — lesson-learned |
| Gotcha archetypes (same value two names, append-only table, misleading 200); description = when to trigger, with trigger phrases; don't state the obvious | Anthropic — Lessons from building Claude Code: how we use skills |
| Third-person description, what + when, ≤1024 chars; concise; consistent terminology; checklist workflows; ≥3 evaluations | Anthropic — Skill authoring best practices |
| Nested CLAUDE.md loads on demand → read INSIGHTS.md explicitly; contradicting instructions get picked arbitrarily | Claude Code docs — memory |
| One-line imperative entries; "add to …" trigger phrasing | dev.to/evoleinik — CLAUDE.md persistent memory |
| Deterministic append script + PreToolUse guard (scripts beat markdown for checks; skill-scoped hooks) | MindStudio — claude-code-skills-code-scripts-vs-markdown-instructions; Anthropic blog (`/careful`, `/freeze` on-demand hooks); Claude Code docs — hooks in skills |
| Stop hook for reliable capture (deferred to L06) | MindStudio — compounding-knowledge-loop, obsidian-hooks, skills-vs-hooks |

Rejected on purpose: "MUST update even if nothing new" (self-learning-claude-code-skill-learnings-md) — conflicts with "only what's substantial";
30-item cap (evoleinik) — slides use ~200; multi-line Context/Problem/Solution entries (johnlindquist) — too verbose for a file loaded every session;
editing/merging existing entries during wrap-up (MindStudio "extend or update them") — conflicts with append-only.
