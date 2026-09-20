# References — engineering-insights

What each source contributed to `SKILL.md`. Read only when changing the skill.

## Contents

- Official (Anthropic)
- The learnings-loop pattern
- Self-improving CLAUDE.md
- Comparable skills
- Adjacent context management
- Deliberate deviations

## Official (Anthropic)

- **[Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)**
  — `description` is the discovery interface: it carries both what the skill
  does and when to use it, always in third person, because it is injected into
  the system prompt. `name`: lowercase/hyphens, ≤64 chars, may not contain
  "claude" or "anthropic". Body under 500 lines; references one level deep from
  SKILL.md (nested refs get partially read). Match freedom to fragility —
  hence the routing table (low freedom) beside the "is this an insight?"
  heuristic (high freedom).
- **[Lessons from building Claude Code: how we use skills](https://claude.com/blog/lessons-from-building-claude-code-how-we-use-skills)**
  — "write descriptions for the model, not for humans"; include trigger words.
  "Most of our best skills began as a few lines and a single gotcha" — the
  reason this skill stayed short. Skills are folders, not just markdown (they
  may carry scripts); dynamic hooks scoped to an active skill exist.

## The learnings-loop pattern

- **[Self-learning AI skill system with Learnings.md + wrap-up](https://www.mindstudio.ai/blog/self-learning-ai-skill-system-learnings-md-wrap-up)**
  — the seven fixed sections used here verbatim; the "actionable cold" quality
  rule; *What Doesn't Work* is the most valuable and most often skipped
  section; the vague-vs-useful calibration pair; file bloat past ~200 entries.
- **[How to build a learnings loop](https://www.mindstudio.ai/blog/how-to-build-learnings-loop-claude-code-skills)**
  — the session protocol wording, and the conflict rule taken literally: "do
  not overwrite existing entries — only append, or correct with a dated note".
  LEARNINGS ≠ CLAUDE.md: evolving knowledge vs stable configuration.
- **[What is Claude Code auto-memory](https://www.mindstudio.ai/blog/what-is-claude-code-auto-memory)**
  — the four selection filters that became the write-gate: recurrence,
  inferability, stability, project-specificity. Also: an incorrect entry
  propagates into every future session, so entries are a draft under review.
- **[Self-learning Claude Code skill with Learnings.md](https://www.mindstudio.ai/blog/self-learning-claude-code-skill-learnings-md)**
  — an entry must carry observation *and* action; a low-confidence finding gets
  marked, not dropped. Markdown works without RAG because models apply
  structured context better than they reconstruct it.
- **[Self-evolving memory with Obsidian + hooks](https://www.mindstudio.ai/blog/self-evolving-claude-code-memory-obsidian-hooks)**
  — the four capture categories (Patterns · Mistakes · Decisions · Context);
  superseded here by the seven sections, but they survive in the signal ranking.
- **[Compounding knowledge loop](https://www.mindstudio.ai/blog/compounding-knowledge-loop-claude-code)**
  — the five hook types; `Stop` is the one that would fire at session end. Not
  used: this skill is deliberately hook-free.

## Self-improving CLAUDE.md

- **[Self-improving AI: one prompt that makes Claude learn from every mistake](https://dev.to/aviad_rozenhek_cba37e0660/self-improving-ai-one-prompt-that-makes-claude-learn-from-every-mistake-16ek)**
  — rule phrasing: lead with the why, then ALWAYS/NEVER, then something
  concrete; bullets over paragraphs; one point per block.
- **[CLAUDE.md: building persistent memory for AI coding agents](https://dev.to/evoleinik/claudemd-building-persistent-memory-for-ai-coding-agents-5322)**
  — the one-line `Add to insights: …` shortcut; flag mentally during the
  session, write once the fix is confirmed; "only add if genuinely useful"; the
  three pruning criteria (fixed bugs, duplicates, never proved useful). Limits:
  this is agent-to-agent transfer, not a replacement for documentation.

## Comparable skills

- **[glebis/claude-skills → retrospective](https://github.com/glebis/claude-skills/blob/main/retrospective/SKILL.md)**
  — the depth check before running (short session → skip); explicit user
  corrections outrank tool failures as a signal; cap candidates at five;
  dedupe against existing documentation; "one question call, then silent
  execution". Its multi-session modes (`today`, a given date, parsed from JSONL
  transcripts) are out of scope here.
- **[Lessons Learned (AI development retro)](https://mcpmarket.com/tools/skills/lessons-learned-retrospectives)**
  — the anti-platitude bar: entries must be specific and evidence-based;
  lessons come from successes, discoveries and pitfalls.
- **[CLAUDE.md Lessons Manager](https://mcpmarket.com/tools/skills/claude-md-lessons-manager)**
  — duplicate detection and rule consolidation to keep the file lean;
  session-end reminders.
- **[omega-memory](https://github.com/omega-memory/omega-memory)** — the cost
  being paid without this: 10–15 minutes per session re-explaining
  architecture, preferences and past debugging.

## Adjacent context management

- **[Context compounding explained](https://www.mindstudio.ai/blog/claude-code-context-compounding-explained)**
  — `CLAUDE.md` ships with every request as fixed-size system input, so the
  protocol there is kept to a few lines; `INSIGHTS.md` is read conditionally
  and may grow.
- **[Skills vs hooks](https://www.mindstudio.ai/blog/claude-code-skills-vs-hooks-difference)**
  — "hooks control behaviour, skills expand capability". Without a hook nothing
  is guaranteed to fire, which is why the trigger is doubled (as-you-go and
  wrap-up) and a user phrase is in the description.
- **[Code scripts vs markdown instructions](https://www.mindstudio.ai/blog/claude-code-skills-code-scripts-vs-markdown-instructions)**
  — scripts win for deterministic, verifiable steps. Not applicable here: the
  module is already visible in the touched file paths.

## Deliberate deviations

- **File is `INSIGHTS.md`, not `LEARNINGS.md`.** The repo already ships
  `INSIGHTS.md` per module and every `CLAUDE.md` links to it. Two knowledge
  files in one module is exactly the conflicting-entries failure the sources
  warn about. The *structure* is the sources'.
- **No forced start-check** ("confirm you've read it and summarize the top 3").
  It costs a step in every session, including trivial ones; reading stays
  conditional, matching how the `CLAUDE.md` files already work.
- **No hooks and no script.** Chosen for this repo; it makes the trigger
  weaker, which the doubled trigger compensates for.
