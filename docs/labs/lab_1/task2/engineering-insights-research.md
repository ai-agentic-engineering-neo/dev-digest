# engineering-insights / INSIGHTS.md — Research Collection

All materials discovered while working on the `engineering-insights` skill (capture insights loop) for the course. Grouped by topic. Each entry contains: **essence** + **actionable takeaway** + **link**.

---

## 1. Primary Guides on the Insights Loop (must-read)

### [MindStudio — Self-Learning AI Skill System with INSIGHTS.md + Wrap-Up Skill](https://www.mindstudio.ai/blog/self-learning-ai-skill-system-learnings-md-wrap-up)
*24.03.2026. The most complete practical guide. Fully read.*

**Key Takeaways:**
* **Ready-made file structure (fixed sections):** `What Works` · `What Doesn't Work` · `Codebase Patterns` · `Tool & Library Notes` · `Recurring Errors & Fixes` · `Session Notes (datestamped)` · `Open Questions`.
* **Examples of Vague vs. Useful:** 
    * ❌ "Promises can be tricky" $\rightarrow$ ✅ "`Promise.all()` in the ingest pipeline timeouts after 30 elements — use `Promise.allSettled()` with batches of 10."
    * ❌ "Be careful with async" $\rightarrow$ ✅ "State checkout flow is always via Zustand (`cartStore.ts`), because the cart is shared by 3 components."
* **Three ways to trigger wrap-up:** Slash command `/wrap-up` (`.claude/commands/wrap-up.md`), automatic hook (`PostToolUse`/`Stop`), or manual prompt. 
    * *Conclusion:* Manual is unreliable — "if you skip the wrap-up, the system doesn't learn."
* **Ready-to-use text for `CLAUDE.md`:** 
    * *Session Context section:* "before starting any work, read INSIGHTS.md… treat as high-confidence guidance."
    * *End of Session section:* "run `/wrap-up`… Do not skip this step."
* **Common mistakes:** Not running wrap-up consistently; overly generic entries; file becomes too long (>200 entries — signal/noise ratio drops); conflicting entries; skipping the "What Doesn't Work" section.
* **Team mode:** Append-only in PRs; designated maintainer consolidates; unified entry format; commit `INSIGHTS.md` to the repo.
* **Cadence:** Wrap-up after every session >30 min involving a problem/solution/discovery; skip trivial fixes. Quarterly review for cleaning.
* **FAQ:** Wrap-up can corrupt the database (LLM summarizes incorrectly) $\rightarrow$ `INSIGHTS` is a draft subject to review; human spot-check required; connection to RAG (this is "manual RAG without infrastructure").

### [MindStudio — How to Build an Insights Loop for Claude Code Skills](https://www.mindstudio.ai/blog/how-to-build-learnings-loop-claude-code-skills)
*19.03.2026.*

**Key Takeaways:**
* **Protocol in `CLAUDE.md` (Session Protocol):** At start — read `INSIGHTS.md` + briefly summarize; at end — identify patterns/mistakes, append, do not overwrite (correct with a dated note).
* **Enforced active reading:** "Before we begin, confirm you've read `INSIGHTS.md` and summarize the top 3 most relevant points" — forces processing rather than passive loading; serves as a sanity check that the file was actually read.
* **Distinction:** `INSIGHTS` $\neq$ `CLAUDE.md` (different purposes); `INSIGHTS` $\neq$ chat replay (extracts insight, not history).

### [MindStudio — Compounding Knowledge Loop in Claude Code](https://www.mindstudio.ai/blog/compinding-knowledge-loop-claude-code)
*Mechanics of session lifecycle hooks + auto-updating database.*

**Key Takeaways:**
* **5 types of hooks:** `PreToolUse`, `PostToolUse`, `Notification`, `Stop`, `SubagentStop`. For capture, the most important is **`Stop`** (end of session).
* **Problem formulation:** The agent exists in the context window; at the end of a session, nothing persists; "You repeat yourself constantly… making the same class of mistakes as last week… institutional knowledge lives in your head, not the agent's."
* **Configuration:** Basic example of hook configuration in `.claude/settings.json`.

### [MindStudio — Self-Learning Claude Code Skill with INSIGHTS.md](https://www.mindstudio.ai/blog/self-learning-claude/skill-learnings-md)
*Why this pattern works without RAG/vectors.*

**Key Takeaways:** 
* "Just a file that the previous version of Claude left notes in for the current version to read."
* Markdown is the correct format (Claude reads/writes it natively).
* Long-context studies show models apply structured context better than retrieving knowledge from scratch.

### [MindStudio — Self-Evolving Claude Code Memory with Obsidian + Hooks](https://www.mindstudio.ai/blog/self-evolving-claude-code-memory-obsidian-hooks)
*Stop-hook writes to an Obsidian vault via Anthropic API.*

**Key Takeaways:**
* **Full Stop-hook workflow:** script reads session transcript from local storage $\rightarrow$ sends to Claude with extraction prompt $\rightarrow$ receives structured insights $\rightarrow$ writes markdown to vault $\rightarrow$ future sessions read it.
* **4 categories of capture:** `Patterns` · `Mistakes` · `Decisions` · `Context` (each in its own subfolder + auto-indexing). This forms the basis for our 4 categories.

### [MindStudio — What Is Claude Code Auto-Memory](https://www.mindstudio.ai/blog/what-is-claude-code-auto-memory)
*How an agent appends knowledge between sessions.*

**Key Takeaways:** Overview of the auto-memory mechanism; what to store (build/test commands, conventions, architectural decisions, env quirks); early review of entries prevents error accumulation.

---

  ## 2. Self-improving `CLAUDE.md` (Related Pattern)

### [dev.to / Aviad Rozenhek — Self-Improving AI: One Prompt That Makes Claude Learn From Every Mistake](https://dev.to/aviad_rozenhek_cba37e0660/self-improving-ai-one-prompt-that-makes-claude-learn-from-every-mistake-16ek)

**Key Takeaways:**
* **The idea of meta-rules:** "We have thousands of tokens of cognition at the start of every session — why treat `CLAUDE.md` as static when we could turn it into a self-improving system."
* **Compounding:** Session 1 — Claude makes 3 mistakes, you apply the prompt 3 times $\rightarrow$ 3 new rules; Session 2 — reads the rules at the start, these mistakes no longer occur.
* **Writing rules:** Focus on "why", use `NEVER`/`ALWAYS`, be concise, update the summary.

### [dev.to / evoleinik — CLAUDE.md: Building Persistent Memory for AI Coding Agents](https://dev.to/evoleinik/claudemd-building-persistent-memory-for-ai-coding-agents-5322)

**Key Takeaways (Best live quotes):**
* "Add to INSIGHTS: Prisma Accelerate has 5MB response limit — use `select` not `include`" — example of a single-line entry.
* **Workflow:** During the session, flag it mentally $\rightarrow$ after confirmation, add the fix; at the end, "Review this session and add any non-obvious findings… only if genuinely useful"; monthly — delete fixed bugs / duplicates / things that are never needed.
* **Compounding effect:** "After 3 months… the agent feels like a team member who's been on the project for months, not a contractor starting fresh every morning."
* **Limits:** This is not a replacement for documentation; format optimized for LLM (terse, declarative); not a crutch for poor tooling (if the agent forgets how to run tests — perhaps the test command is too long, fix the root cause).

---

## 3. Official from Anthropic

### [Anthropic — Lessons from building Claude Code: How we use skills](https://claude.com/blog/lessons-from-building-claude-code-how-we-use-skills)
*Skills are in active use within Anthropic (hundreds of them).*

**Key Takeaways:**
* **Anatomy:** "Common misconception: skills are just markdown files. They're folders that can include scripts, assets, data" — supports the anatomy of a skill.
* **Dynamic hooks in skills:** A skill can register hooks that exist only while the skill is active (only for this session) — "for opinionated hooks you don't want always on." Examples: `/careful` (blocks `rm -rf`, `DROP TABLE`, `force-push`), `/freeze` (blocks `Edit` outside a specific directory during debugging).

### [Anthropic — Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)

**Key Takeaways:**
* **`description` = discovery interface:** Must include "what it does" AND "when to apply"; always use third person (injected into system prompt).
* **Testing:** Test on all models you will work with (Opus vs Haiku — different levels of detail); skill names should be in gerund form.
* **Efficiency:** Skills act as additions to models — efficiency depends on the base model.

---

## 4. Ready-made analogous skills (Implementation examples)

### [glebis/claude-skills — retrospective skill](https://github.com/glebis/claude-skills)
*A ready-to-use skill for session retrospectives.*

**Key Takeaways:** `/retrospective` (current session), `/retrospective today` (all sessions for the day, multi-session mode), `/retrospective 2026-05-24` (specific date); "reviews conversations, extracts learnings, updates skills"; "Use when: end of work day to capture learnings across all sessions."

### [mcpmarket — Lessons Learned (AI Development Retro)](https://mcpmarket.com/tools/skills/lessons-learned-retrospectives)

**Key Takeaways:** Parses build-summaries $\rightarrow$ proposes lessons $\rightarrow$ format in `LESSONS.md` $\rightarrow$ optionally updates `CLAUDE.md`; "enforces high quality standards… prevents generic platitudes… focuses on actionable, transferable technical knowledge."

### [mcpmarket — CLAUDE.md Lessons Manager](https://mcpmarket.com/tools/skills/claude-md-lessons-manager)

**Key Takeaways:** Automatic extraction from chat history + terminal output; session-end reminders; **duplicate detection and rule consolidation** (to keep it lean).

### [omega-memory / Omega (MCP) — Reddit draft with real experience](https://glama.ai/mcp/servers/@omega-memory/Omega/blob/.../docs/reddit-drafts.md)

**Key Takeaways (Real case from r/ClaudeAI):** "6 months as a daily driver; biggest friction — context loss, 10-15 mins every session spent re-explaining architecture, code preferences, past debugging." Before/After: "We chose PostgreSQL for ACID, not Redis" — previously explained every time, now the agent starts already knowing the decision.

---

## 5. Tangential (Context Management, Code Skills)

### [MindStudio — Claude Code Skills: Code Scripts vs Markdown Instructions](https://www.mindstudio.ai/blog/claude-code-skills-code-scripts-vs-markdown-instructions)
*Why scripts > markdown.*

**Key Takeaways:** Executable scripts reduce token usage by up to 90% and make tasks more reliable — supports the "Capability Uplift" and the idea that "a code detector is more reliable than a model."

### [MindStudio — Skills vs Hooks: difference and when to use each](https://www.mindstudio.ai/blog/claude-code-skills-vs-hooks-difference)

**Key Takeaways:** "hooks aren't called by Claude — the system calls them"; three-level memory (capture everything / curate what matters).

### [MindStudio — Context Compounding Explained](https://www.mindstudio.ai/blog/claude-code-context-compounding-explained)

**Key Takeaways:** Shorter, focused sessions = lower context peak; `CLAUDE.md` as a fixed-size system input (does not compound with history).

---

## 6. Ready-made skill construction for the course (Synthesis of all above)

**Name:** `engineering-insights`.  
**Writes to:** `INSIGHTS.md` of the module touched by the task (`client`, `server`, `reviewer-core`, `e2e`; the task brief's `apps/client`, `apps/server`, `packages/reviewer-core`, `packages/repo-intel` map onto these) — each has its own file.  
**Mode:** append-only.

**`INSIGHTS.md` Sections (from MindStudio, adapted to 4 categories):**
* `What Works` (Pattern) · `What Doesn't Work` (Mistake/antipattern) · `Codebase Patterns + Tool/Library Notes` (Context) · `Decisions` (decision with reasoning) · `Recurring Errors & Fixes` · `Session Notes` (datestamped) · `Open Questions`. (The final spec in `learnings_structure.md` drops the separate `Decisions` section; decisions go in `Codebase Patterns`.)

**Trigger:** Dual trigger — at the end of a task (`wrap-up`) + "capture as you go" for non-obvious findings.  
**Cadence:** sessions >30 min involving a problem/solution/discovery.

**Entry Format:** date + category + essence + proof (`file:line`). Actionable "cold".

**Anti-banality:** The test: "if this were obvious to anyone reading the code — do not write it." Vague vs useful — use examples from MindStudio.

**Control:** Monthly prune (outdated = harmful); conflict resolution; limit of ~200 entries or splitting into domain files; `INSIGHTS` is a draft subject to spot-checks; git versioning.

**Closing the loop (`CLAUDE.md`):**
* **Session Context:** "before work, read `INSIGHTS.md`; treat as high-confidence guidance unless told otherwise."
* **End of Session:** "use the `engineering-insights` skill to update `INSIGHTS.md`; do not skip."
* **Start-check to force reading:** "confirm you've read `INSIGHTS.md` and summarize the top 3 most relevant points."

**Course Arc:** 
* **L01:** We write the skill, see the effect and the unreliability of automation $\rightarrow$ 
* **L06:** The `Stop-hook` makes capture automatic and foolproof (because "if it requires a human trigger, it won't happen consistently enough to be useful").
