# References

Sources behind this skill's design, and what each one contributed.

## [MindStudio — LEARNINGS.md self-learning system](https://www.mindstudio.ai/blog/self-learning-ai-skill-system-learnings-md-wrap-up)

Primary source. Defines the seven sections used here, and the cold-read bar:
*"Every entry should be specific enough that an agent reading it cold knows
exactly what to do or avoid."*

The dedup rule this skill enforces comes from here — *"Do not duplicate
entries already in the file — extend or update them instead"* — along with
reading the file at session start, resolving conflicting entries explicitly,
and the signal-to-noise warning past ~200 entries.

Prune cadence: this article says **quarterly**; the course slides say
**monthly**. Either works — the point is that it is deliberate and scheduled,
not continuous.

## [MindStudio — building a learnings loop](https://www.mindstudio.ai/blog/how-to-build-learnings-loop-claude-code-skills)

Source of the four-part quality filter (Specific · Reusable · Actionable ·
Dated) and of the sharpest rule in the skill body: *"It should change
behavior. If knowing it doesn't affect what Claude does, skip it."*

Also the exclusion list — general best practices, one-off situations, and
anything already documented in the codebase.

## [MindStudio — the compounding knowledge loop](https://www.mindstudio.ai/blog/compounding-knowledge-loop-claude-code)

What is worth capturing at all: decisions that involved tradeoffs (so the
*why* survives), solutions to non-obvious problems, new conventions, and
context tied to specific files or modules.

Also the deterministic trigger this repo does not have yet: a `Stop` hook
firing at end of session. Planned for L06 — until then, invocation is
best-effort via `description`/`when_to_use` plus the manual call.

## [Eugene Oleinik — CLAUDE.md as agent memory](https://evoleinik.com/posts/claude-md-as-agent-memory/)

Timing: flag something mid-session, but only write it **after the fix is
confirmed working**. Keep a cap and drop outdated items. Reports that after
~3 months the agent "feels like a team member who's been on the project for
months, not a contractor starting fresh every morning."

## [Claude Code — Skills documentation](https://code.claude.com/docs/en/skills)

Mechanics. `description` decides automatic loading; `when_to_use` adds trigger
phrases and example requests, and both share a 1,536-character cap in the
skill listing. When a skill fails to fire, the documented fix is to *"check
the description includes keywords users would naturally say."*

Why the body stays short while `examples.md` can be long: *"Once a skill
loads, its content stays in context across turns, so every line is a recurring
token cost"*, whereas supporting files *"don't need to load into context every
time the skill runs."*

Also the naming rule behind `/engineering-insights`: when a skill and a
command share a name, **the skill takes precedence**.
