# References — the learnings-loop research behind this skill

Condensed from course research on the "learnings loop" / self-improving-agent
pattern. Full notes kept by the course team; this is what this skill actually
implements.

## Core guides (must-read)

- **MindStudio — Self-Learning AI Skill System with Learnings.md + Wrap-Up
  Skill** (2026-03-24) —
  https://www.mindstudio.ai/blog/self-learning-ai-skill-system-learnings-md-wrap-up
  Source of the fixed-section file structure (What Works / What Doesn't Work
  / Codebase Patterns / Tool & Library Notes / Recurring Errors & Fixes /
  Session Notes / Open Questions) and the vague-vs-useful bar this skill
  reuses in `examples.md`. Also: a manual-only trigger is unreliable —
  "if you skip the wrap-up, the system doesn't learn."

- **MindStudio — How to Build a Learnings Loop for Claude Code Skills**
  (2026-03-19) —
  https://www.mindstudio.ai/blog/how-to-build-learnings-loop-claude-code-skills
  Source of the "Reading it back" section: force *active* reading (name the
  top points, don't just load the file) as both a comprehension aid and a
  sanity check that the file was actually read. INSIGHTS.md is an extracted
  insight, not a chat replay.

- **MindStudio — Compounding Knowledge Loop in Claude Code** —
  https://www.mindstudio.ai/blog/compounding-knowledge-loop-claude-code
  The `Stop` hook is the reliable automatic trigger point (5 hook types
  exist; `Stop` = end of session). This skill is the manually-triggered
  precursor to that automation — see "Course arc" below.

- **MindStudio — Self-Learning Claude Code Skill with Learnings.md** —
  https://www.mindstudio.ai/blog/self-learning-claude-code-skill-learnings-md
  Why plain markdown, not a vector store: "just a file that the previous
  version of Claude left notes in for the current version to read."

- **MindStudio — Self-Evolving Claude Code Memory with Obsidian + Hooks** —
  https://www.mindstudio.ai/blog/self-evolving-claude-code-memory-obsidian-hooks
  Source of the 4-way capture split (Patterns / Mistakes / Decisions /
  Context) this skill's fixed sections map onto.

- **MindStudio — What Is Claude Code Auto-Memory** —
  https://www.mindstudio.ai/blog/what-is-claude-code-auto-memory
  What's worth storing (build/test commands, conventions, architecture
  decisions, env quirks) and why early review matters — unreviewed capture
  compounds errors, not just knowledge.

## Self-improving CLAUDE.md (adjacent pattern, not this skill)

- **dev.to / Aviad Rozenhek — Self-Improving AI** —
  https://dev.to/aviad_rozenhek_cba37e0660/self-improving-ai-one-prompt-that-makes-claude-learn-from-every-mistake-16ek
- **dev.to / evoleinik — CLAUDE.md: Building Persistent Memory for AI Coding
  Agents** —
  https://dev.to/evoleinik/claudemd-building-persistent-memory-for-ai-coding-agents-5322
  "After 3 months... the agent feels like a team member who's been on the
  project for months, not a contractor starting fresh every morning." Also
  the boundary this skill respects: not a substitute for documentation, and
  not a crutch for bad tooling — if the agent keeps forgetting a command, fix
  the command, don't just log around it.

## Official Anthropic

- **Lessons from building Claude Code: how we use skills** —
  https://claude.com/blog/lessons-from-building-claude-code-how-we-use-skills
  Skills are folders, not just markdown; can register session-scoped hooks.
- **Skill authoring best practices** —
  https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
  `description` is the discovery interface — third person, states both what
  and when. Followed in this skill's frontmatter.

## Prior art (skills that do something similar)

- **glebis/claude-skills — retrospective skill** —
  https://github.com/glebis/claude-skills
  `/retrospective`, `/retrospective today`, `/retrospective <date>` — session,
  day, or date-scoped extraction.
- **mcpmarket — Lessons Learned (AI Development Retro)** —
  https://mcpmarket.com/tools/skills/lessons-learned-retrospectives
  "Enforces high quality standards... prevents generic platitudes" — the
  source of this skill's anti-vague framing.
- **mcpmarket — CLAUDE.md Lessons Manager** —
  https://mcpmarket.com/tools/skills/claude-md-lessons-manager
  Duplicate detection / rule consolidation — informs the hygiene section.
- **Omega (MCP) — real-world usage notes** —
  https://glama.ai/mcp/servers/@omega-memory/Omega/blob/main/docs/reddit-drafts.md
  The problem this whole pattern solves, in one line: "10-15 min every
  session re-explaining architecture, code preferences, past debugging."

## Course arc

L01 ships this skill as a manually/description-triggered capability — the
point is to see it work *and* see how unreliable a human-remembered trigger
is. L06 wires a `Stop` hook so capture stops depending on anyone remembering
to run it.
