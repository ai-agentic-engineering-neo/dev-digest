# Agents — map

Project subagents for Claude Code: one Markdown file per agent (YAML frontmatter + system prompt).
This README is the **map** of the set — who does what, with which rights, from which input to which
output, and where the rules come from. The rules themselves live in the agent files and the linked
skills; don't copy them here.

## Pipeline

```
question ─────────► researcher ─► report (chat)

feature request ──► planner ─► plans/<feature>.md (draft) ─► user sets "approved"
                ──► /implement-plan plans/<feature>.md          (manual skill, main session)
                      per wave: implementer-backend / implementer-frontend × tasks, in parallel
                      ─► gate: ownership diff · Verify · typecheck · layer check
                      ─► task Status in the plan · insight candidates → engineering-insights
                ──► user runs /pr-self-review ─► push / PR
```

## Roles, input, output

| Agent | Responsibility | Input | Output artifacts | Launched by |
|---|---|---|---|---|
| [researcher](researcher.md) | Answer one concrete question from the repo and/or external sources; interview first if the request is vague | a question (free text) | report in chat: TL;DR, findings with `path:line`/URL, references, "Not found / unverified" — or clarifying questions | anyone (`@researcher`, "use the researcher…") |
| [planner](planner.md) | Turn a feature that spans 2+ packages or 3+ tasks into an executable plan; no code | feature request (+ links to specs) | `plans/<feature>.md` from [TEMPLATE](../../plans/TEMPLATE.md) (`Status: draft`) + its line in [plans/README](../../plans/README.md); chat summary (path, wave table, open questions, could-not-verify) — or questions, or a `CANNOT PLAN` note | main session / user |
| [implementer-backend](implementer-backend.md) | Write the code of ONE `[backend]` task: `server/`, `reviewer-core/`, `e2e/` | `plan: plans/<f>.md` + `task: T<n>` (+ `base` commit) | code + tests in the task's owned files only; report `STATUS · FILES · TESTS · DEVIATIONS · FOREIGN ERRORS · BLOCKER · INSIGHT CANDIDATES` | [/implement-plan](../skills/implement-plan/SKILL.md) |
| [implementer-frontend](implementer-frontend.md) | Same for ONE `[frontend]` task: `client/` | same | same | [/implement-plan](../skills/implement-plan/SKILL.md) |

Not agents but part of the set: [implementer-protocol](../skills/implementer-protocol/SKILL.md) (shared
working protocol injected into both implementers — edit it there) and
[implement-plan](../skills/implement-plan/SKILL.md) (manual orchestrator run by the main session; it
alone updates task statuses and records insights).

## Model and permissions

"Enforced" = the harness blocks it; "prompt" = only the system prompt says so.

| Agent | Model | Allowed tools | Denied | Limits enforced | Limits by prompt only |
|---|---|---|---|---|---|
| researcher | sonnet | Read, Grep, Glob, Bash, WebSearch, WebFetch, AskUserQuestion | everything else (allowlist): no Write/Edit, Agent, Skill | no file writes, no sub-agents, no skills | Bash read-only; never open `.env*` / `clones/**/.git/config` |
| planner | opus · effort high | Read, Grep, Glob, Bash, Write, AskUserQuestion | Agent, Edit, Skill | `Write` only `plans/*.md` ([hook](hooks/plans-only-write.mjs)) | Bash read-only |
| implementer-backend | sonnet · maxTurns 60 | Read, Grep, Glob, Edit, Write, Bash | Agent, Skill | no sub-agents, no extra skills, ≤ 60 turns | owned files only (checked after the wave by `/implement-plan`); no git/install/`docker compose down -v`; Do-not-touch paths |
| implementer-frontend | sonnet · maxTurns 60 | same | Agent, Skill | same | same |

`AskUserQuestion` may be unavailable when an agent runs as a subagent — then it returns its questions
to the caller instead of asking.

## Injected skills (`skills:` frontmatter — full text loaded at start)

| Skill | planner | impl-backend | impl-frontend |
|---|:-:|:-:|:-:|
| implementer-protocol | | ● | ● |
| onion-architecture | ● | ● | |
| fastify-best-practices | ● | ● | |
| drizzle-orm-patterns | ● | ● | |
| postgresql-table-design | ● | ● | |
| zod | ● | ● | |
| typescript-expert | ● | ● | ● |
| security | ● | ● | ● |
| frontend-ui-architecture | ● | | ● |
| react-best-practices | ● | | ● |
| next-best-practices | ● | | ● |
| react-testing-library | ● | | ● |

researcher has none. Sync rules: each implementer set = all skills that
[routing.json](../skills/pr-self-review/references/routing.json) routes to its packages (client has no
non-vendor `zod` imports → no `zod` in frontend); planner = union of both implementer sets.
Add a skill to an implementer → add it to the planner too.

## Where the planner and implementer rules come from

Status: **verified** = read in the source on 2026-11-06 · **via researcher** = from the researcher's
report of 2026-11-06, not re-read · **internal** = this repo · **decision** = the user's choice.

| Source | Status | Rules it grounds | Where |
|---|---|---|---|
| [Claude Code — Subagents](https://code.claude.com/docs/en/sub-agents) | verified | `skills:` preload (full text, max 32, no `disable-model-invocation`, missing name skipped silently → `BLOCKED` check); `tools`/`disallowedTools` allowlist; `model`, `effort`, `maxTurns`; frontmatter `hooks:` PreToolUse, exit 2 = block; fresh context per subagent → self-contained plan + `plan`/`task` input | all frontmatter; [hook](hooks/plans-only-write.mjs); protocol §1 |
| [Claude Code — Best practices](https://code.claude.com/docs/en/best-practices) | via researcher | give a runnable check and a "done" definition → Verify per task; interview before spec → planner Step 0; document only what the repo doesn't show → planner discovers modules instead of a hard-coded list | planner Steps 0–2; TEMPLATE `Verify` |
| [Anthropic — How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) | via researcher | each worker gets objective, output format, boundaries; explicit effort-scaling → ≤ 4 tasks per wave | protocol §1/§5; planner "Waves" |
| [Anthropic — Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) | via researcher | orchestrator-workers for multi-file changes; minimal tools, short prompts | pipeline; tool allowlists |
| [obra/superpowers](https://github.com/obra/superpowers) — `writing-plans`, `subagent-driven-development`, `dispatching-parallel-agents` (community) | via researcher | file map before tasks; exact paths + interfaces per task; no "TBD"; plan self-check; parallel only with no shared files, all in one message; `DONE / DONE_WITH_CONCERNS / BLOCKED`; implementers don't dispatch sub-agents | TEMPLATE; planner Step 2–3; protocol §3/§5; `/implement-plan` §2 |
| [github/spec-kit `tasks-template.md`](https://github.com/github/spec-kit/blob/main/templates/tasks-template.md) (community) | via researcher | `T<n>` IDs; blocking foundational phase → W0 contracts; checkpoints → gate per wave | TEMPLATE "Waves"; `/implement-plan` §4 |
| root `CLAUDE.md` (= `AGENTS.md`), `<pkg>/CLAUDE.md` | internal | Do-not-touch paths; module layout; workspace scoping; session protocol (and the implementers' exemption from it) | planner Hard rules; protocol §0/§3 |
| `<pkg>/INSIGHTS.md` | internal | no `vendor/shared` edits → module types + client mirror; Windows bins via `node`; `check-architecture.mjs` baseline; hotspot/i18n traps | planner Global constraints + per-task Insights; protocol §2; [plans/README](../../plans/README.md) Verify commands |
| [pr-self-review routing.json](../skills/pr-self-review/references/routing.json) | internal | which skills each implementer (and the planner) must carry | `skills:` lists |
| user decisions, 2026-11-06 | decision | two implementer files; plans in `plans/`; no worktrees (disjoint ownership instead); implementers only write code, no self-audit; every relevant skill injected, planner gets all of them; `CANNOT PLAN` note instead of invented tasks | agent files; protocol §4; planner |

## Supporting files

| File | Role |
|---|---|
| [hooks/plans-only-write.mjs](hooks/plans-only-write.mjs) | planner's PreToolUse guard: `Write` outside `plans/*.md` → exit 2 |
| [plans/TEMPLATE.md](../../plans/TEMPLATE.md) | plan structure the planner fills |
| [plans/README.md](../../plans/README.md) | plan index, lifecycle, the single list of Verify commands |

## Conventions

- File name = `name` in frontmatter, kebab-case. Keys are camelCase and must match the docs exactly — a
  typo is ignored silently.
- Agent definitions are read when the session starts: after editing `.claude/agents/*.md` run `/clear`
  (or restart) before using the agent, otherwise the old version runs.
- Restrict `tools` to what the agent needs; prefer a hook over a prompt rule when a limit must hold.
- Rules that live in `CLAUDE.md` / `INSIGHTS.md` / skills are referenced, not copied into agent prompts.
