# engineering-insights — sources and rationale

For humans maintaining the skill. Not loaded by the agent. Researched 2026-11-19.
"Taken" = rule that made it into SKILL.md / examples.md. "Rejected" = considered, left out, with reason.

## Guides

| Source | Taken | Rejected |
|---|---|---|
| [MindStudio — Learnings.md + Wrap-Up](https://www.mindstudio.ai/blog/self-learning-ai-skill-system-learnings-md-wrap-up) | 7 fixed sections + HTML comment per section; vague→useful pairs; "can't make it specific → don't write"; no duplicates; confirm what was added; CLAUDE.md "high-confidence guidance", "Do not skip" | separate `/wrap-up` command (skill covers it); 2–5 entries floor → 0–5 |
| [MindStudio — Learnings Loop](https://www.mindstudio.ai/blog/how-to-build-learnings-loop-claude-code-skills) | append or correct with dated note (`supersedes`); one insight per bullet; don't store general best practice / one-offs / documented things | `[REVIEW NEEDED]` consolidation pass; "Consolidated Principles" section |
| [MindStudio — Self-Learning Skill](https://www.mindstudio.ai/blog/self-learning-claude-code-skill-learnings-md) | mandatory read before task ("skipping the read breaks the pattern"); LEARNINGS ≠ static instructions → "Not here" rule | write a note even on uneventful runs (user rule: nothing new → write nothing); confidence field (we write only confirmed fixes); archive at 80–100 lines (later, with pruning) |
| [MindStudio — Compounding Knowledge Loop](https://www.mindstudio.ai/blog/compounding-knowledge-loop-claude-code) | capture decisions w/ tradeoffs, non-obvious solutions; skip routine edits; load only relevant files (context bloat) | Stop-hook + Python extractor → course L06 |
| [MindStudio — Obsidian + Hooks](https://www.mindstudio.ai/blog/self-evolving-claude-code-memory-obsidian-hooks) | categories Patterns/Mistakes/Decisions/Context map onto our sections; sensitive-data filter | vault, auto-index, API-key script (outside local-first repo) |
| [MindStudio — Auto-Memory](https://www.mindstudio.ai/blog/what-is-claude-code-auto-memory) | selection criteria: recurrence, non-inferability, stability (not code in flux), project specificity; unresolved work → nothing concrete (gate #4); wrong entry propagates everywhere → verify before supersede | — |
| [MindStudio — Scripts vs Markdown](https://www.mindstudio.ai/blog/claude-code-skills-code-scripts-vs-markdown-instructions) | — | dedup/append script: no example in article; revisit if markdown dedup proves unreliable |
| [MindStudio — Skills vs Hooks](https://www.mindstudio.ai/blog/claude-code-skills-vs-hooks-difference) | "must happen every time → hook" justifies L06 hooks | three-tier memory: not in article |
| [MindStudio — Context Compounding](https://www.mindstudio.ai/blog/claude-code-context-compounding-explained) | keep conclusions, drop process; small files (fixed cost per message) | — |
| [dev.to — Aviad Rozenhek](https://dev.to/aviad_rozenhek_cba37e0660/self-improving-ai-one-prompt-that-makes-claude-learn-from-every-mistake-16ek) | "abstract and generalize the learning"; lead with NEVER/ALWAYS; concrete commands; bullets not paragraphs | two-tier summary+details layout (files are small) |
| [dev.to — evoleinik](https://dev.to/evoleinik/claudemd-building-persistent-memory-for-ai-coding-agents-5322) | add only after fix confirmed; "saves 5+ min" test; one-line terse entries; Prisma example | cap ~30 items (conflicts with append-only; revisit with pruning) |
| [Anthropic — How we use skills](https://claude.com/blog/lessons-from-building-claude-code-how-we-use-skills) | don't state the obvious; gotchas = highest signal; state goal + constraints, not railroad (Goal line); description lists trigger phrases | config.json, on-demand hooks, usage-logging hook |
| [Anthropic — Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) | name/description limits, 3rd person, what + when; concise body; examples.md one level deep | evals across Haiku/Sonnet/Opus — still TODO |

## Example skills read

| Skill | Taken | Rejected |
|---|---|---|
| [glebis `retrospective`](https://github.com/glebis/claude-skills/tree/main/retrospective) | candidate priority (user correction first); max 5 candidates; read target → check dup/conflict → skip with warning; one-line report per action + skipped | AskUserQuestion approval round, multi-session JSONL scan, Linear tasks (heavier than course L01) |
| [glebis `insight-extractor`](https://github.com/glebis/claude-skills/tree/main/insight-extractor) | — | parses `/insights` report into Obsidian; different input |
| [glebis `lab-retro`](https://github.com/glebis/claude-skills/tree/main/lab-retro) | — | cohort survey, not code lessons |
| [lgbarn/shipyard `lessons-learned`](https://github.com/lgbarn/shipyard/tree/main/skills/lessons-learned) | reject truisms, lessons > 2 sentences, line numbers / temp paths (→ `path#symbol` evidence); "when not to use" (design rationale → comments, active bugs → issues); pitfalls rank highest | per-phase LESSONS.md blocks, user approval gate |
| [xtone CLAUDE.md Lessons Manager](https://mcpmarket.com/tools/skills/claude-md-lessons-manager) | signals: fixed errors, approach pivots, user corrections | `/lessons review` mode (later pruning). SKILL.md source not found in repo |
| [Omega memory (MCP)](https://glama.ai/mcp/servers/@omega-memory/Omega) | — | SQLite + embeddings dedup (0.85 similarity) — infra beyond markdown; Reddit-draft link from research list was truncated, not read |
