# Sources behind this skill (read 2026-11-22)

Read page by page via fetch (not search snippets). Vendor blogs are opinion; their numbers (line caps, review cadence,
improvement curves) are unsourced and contradict each other, so treat them as heuristics.

## Taken
| Idea | From |
|---|---|
| Read the learnings file *before* the task, write *after*; keep it separate from the main task logic | MindStudio: self-learning-claude-code-skill-learnings-md, how-to-build-learnings-loop-claude-code-skills, persistent-memory-system-claude-code-agents |
| Section schema (What works / doesn't / patterns / tool notes / errors / session notes / open questions) | MindStudio: self-learning-ai-skill-system-learnings-md-wrap-up (the slide's source) |
| Dated, atomic, specific entries; confidence marker | MindStudio: learnings-md (Date/Observation/Action/Confidence), learnings-loop (`[Date] Description`) |
| "Do not add": already captured, generic best practice, restatements; write only if a future session would behave differently | MindStudio: learnings-md, learnings-loop |
| Append-only; correct with a dated note, don't overwrite | MindStudio: how-to-build-learnings-loop |
| Consolidate/prune periodically, archive file, flag `[REVIEW NEEDED]`, commit to git | MindStudio: learnings-loop, learnings-md |
| Make the read observable (summarize before starting) | MindStudio: learnings-md |
| `description` leads with the use case, "Use when…" wording; limit 1,536 chars for description+when_to_use | code.claude.com/docs/en/skills; large-codebases |
| SKILL.md < 500 lines, details in `references/`; critical text first (compaction keeps first ~5,000 tokens) | code.claude.com/docs/en/skills |
| Nested CLAUDE.md load lazily; CLAUDE.md is context, not enforcement; ~200 lines | code.claude.com/docs/en/memory, large-codebases |

## Rejected / adapted
- "MUST update every session, even if nothing new" (MindStudio) - contradicts our significance bar; replaced by write-only-if-significant.
- JSON-record + system-prompt injection design (MindStudio learnings-loop) - API-style, does not fit a Claude Code skill.
- `skill.json` manifest and `eval.json` evals (MindStudio) - not how Claude Code skills are defined; evals are for output-quality loops, not a notes file.
- Line caps of 80-100 / 500 - conflicting; we use a ~150-entry heuristic.
- Turbodocx page `how-i-use-claude-code-to-ship-features-in-one-session` returned only the homepage; nothing usable.
- support.claude.com skill article states a 200-char description limit; that page targets claude.ai, Claude Code documents 1,536 combined.

## Example skills inspected (structure only)
- Official: `api-conventions` (reference, bullet rules), `deploy` (`context: fork`, `disable-model-invocation`), live-diff skill with `!` shell injection, per-directory `api-testing` ("Use when writing or modifying tests in packages/api/").
- Turbodocx `add-esignature`: frontmatter `name`+`description`, then a 3-step numbered procedure.
- support.claude.com "Brand guidelines": reference-style skill with Overview / When to Apply / Resources.
- MindStudio `skill.md`: process-only steps with "Read learnings.md" as step 1; context kept in separate files.
Takeaway for us: short procedural body, description with explicit "Use when", detail in `references/`.

## Hooks (implemented in `.claude/settings.json` + `.claude/hooks/`)
Source: code.claude.com/docs/en/hooks, read in chunks (UserPromptSubmit and trust sections only via summary - re-check if behaviour surprises).
- `UserPromptSubmit`: plain stdout on exit 0 is added as context (cap 10,000 chars) -> `insights-context.mjs` injects root + matched modules' INSIGHTS.md (~9,000 chars max).
- `Stop`: fires after **every** turn, not at session end; `{"decision":"block","reason":...}` continues the turn; `stop_hook_active` guard; 8 consecutive blocks are overridden by Claude Code -> `insights-stop.mjs` blocks at most once per session, only if `git status` shows non-INSIGHTS/non-`.claude/` changes.
- `SessionEnd`: ~1.5 s timeout, no decision control -> not used.
- Windows: exec form (`command` + `args`) needs a real executable (`node` works; `.cmd`/`.bat` do not). `${CLAUDE_PROJECT_DIR}` in `args` is shown in the docs' examples.
- `PreToolUse` (matcher `Write|Edit|Bash|PowerShell`, exit 2 blocks the call, stderr is the reason) -> `insights-guard.mjs` keeps INSIGHTS.md append-only: Write must retain every existing line in order, Edit's `new_string` must contain `old_string`, destructive shell patterns are blocked (best effort - exotic commands can slip through; the Edit/Write path is the reliable one).
- Interactive sessions hold hooks back until the folder is trusted; hooks cannot judge significance or duplicates - that stays in the skill.
