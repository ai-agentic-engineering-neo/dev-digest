# Agents

Project subagents for DevDigest. Each `*.md` here (except this README) is one agent:
YAML frontmatter (name, description, model, tools) + its system prompt. The agent file
is the source of truth — this README is only the map. Project agents override
same-named agents in `~/.claude/agents/`.

## Catalog

| Agent | Role | Model | Writes files? | Input | Output |
|---|---|---|---|---|---|
| [researcher](researcher.md) | Finds facts in the repo or outside, with evidence | sonnet | no | a concrete question | Research report · or *Clarification needed* |
| [planner](planner.md) | Turns a task/spec into an executable plan | opus (effort high) | no | task or `*/specs/NN-*.md` | Development Plan → saved by caller to `docs/plans/` |
| [implementer](implementer.md) | Executes an approved plan, verifies own diff | sonnet (effort high) | yes | `docs/plans/*.md` (or inline plan) | code + tests + Implementation Report |

Architecture and security review are **not** in this set — they are separate agents
that run after `implementer`.

## Pipeline

```
task / spec ──► researcher (optional: facts, library docs)
            ──► planner ──► Development Plan ──► caller saves docs/plans/<date>-<slug>.md
                                  │  user approves
                                  ▼
                            implementer ──► code + tests + Implementation Report
                                  │
                                  ▼
            architecture & security reviewers ──► caller: engineering-insights WRAP-UP
                                                  (from "Insight candidates") ──► /pr-self-review
```

Subagents cannot ask the user and return only their final message, so every hand-off
is a fixed-format artifact; open questions come back in it (`Clarification needed`,
`Open questions / assumptions`, `STATUS: BLOCKED`).

## Agents

### researcher
- **Responsible for:** repo research (where/how/why, traced flows, git history) and
  external research (library docs pinned to our version, advisories). Every claim has a
  `file:line`, commit or numbered source; unverified items go to "Not found / unverified".
- **Not responsible for:** making changes, using skills, recommending beyond the question.
- **Permissions:** `Read, Grep, Glob, Bash, WebSearch, WebFetch`; `Write, Edit,
  NotebookEdit, Skill` disallowed. Bash read-only by prompt.
- **Input:** a question that can be answered yes/no/found; mode repo | external | both.
- **Output:** `# Research: …` report (Answer · Findings · Sources · Not found / unverified).

### planner
- **Responsible for:** a Development Plan the implementer can follow without guessing:
  reads the touched packages' `AGENTS.md`, `INSIGHTS.md`, `README.md`, `specs/`; maps
  planned files to skills via [`routing.json`](../skills/pr-self-review/routing.json)
  and reads those `SKILL.md`s, so the plan never contradicts implementation rules;
  checks standing constraints (shared-contract copies, migrations, onion rings, client
  data/i18n rules, do-not-touch list).
- **Not responsible for:** writing code, running tests/scripts, reviewing diffs.
- **Permissions:** `Read, Grep, Glob, Bash` only — no `Write/Edit`, no `Skill`
  (skills are read as files), no `Agent`, no `memory`. Bash read-only by prompt.
- **Input:** task description or spec path. Unclear task → returns only
  *Clarification needed* (≤5 questions with defaults).
- **Output:** `# Development Plan` — Save as · Goal · Out of scope · Context used
  (applied INSIGHTS lines) · Constraints & decisions (each with a source) · Skill map ·
  Steps (files, rules, tests, "Done when" command) · Contracts & migrations ·
  Verification plan · Risks · Open questions · Notes for reviewers. ~1–2k tokens.

### implementer
- **Responsible for:** executing the plan step by step in `server/`, `client/`,
  `reviewer-core/` (and `e2e/` when planned); loading skills per touched file via
  `routing.json`; tests with each step; running package gates (typecheck, lint, tests,
  `arch:check`, `check-shared-drift.sh`); self-checking its own diff against the plan.
- **Not responsible for:** planning or redesign (→ `STATUS: BLOCKED`), architecture or
  security review, commits, writing `INSIGHTS.md`.
- **Permissions:** `Read, Edit, Write, Grep, Glob, Bash, Skill` — no `Agent`, no web,
  no worktree isolation (it would branch from `main`). Forbidden commands and
  do-not-touch paths are listed in the prompt; the most dangerous are also denied in
  settings (below).
- **Input:** approved plan (`docs/plans/*.md` path or inline).
- **Output:** uncommitted code + tests, and `# Implementation Report` — STATUS
  (DONE / PARTIAL / BLOCKED) · Steps · Changed files · Skills applied · Verification
  (commands actually run, exit codes) · Deviations · Blockers · Insight candidates ·
  For reviewers.

## Shared guardrails

[`../settings.json`](../settings.json) `permissions.deny` applies to every agent and the
main session: `docker compose down -v`/`--volumes`, `biome check --write|--fix`,
`biome format`, `git push`. Command-level bans live there because `disallowedTools:
Bash(...)` in frontmatter removes all of Bash.

## Sources behind planner and implementer

| Source | Rules taken from it | Applied in |
|---|---|---|
| [Sub-agents](https://code.claude.com/docs/en/sub-agents) | `description` = what + when, "use proactively"; `tools` allowlist for least privilege; omit `Agent` to stop nested spawning; `permissionMode` is ignored under auto/acceptEdits; `memory` enables Write/Edit; `skills` preload injects full text; `isolation: worktree` branches from default branch; subagent can't ask the user and returns only its final message | both frontmatters; planner without Write/Edit/memory; no preload, no isolation; fixed output formats; `Clarification needed` / `BLOCKED` |
| [Permissions](https://code.claude.com/docs/en/permissions) | `permissions.deny` applies to subagents, beats allow, matches any subcommand of a compound command | `../settings.json` |
| [Skills](https://code.claude.com/docs/en/skills) · [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) | progressive disclosure (load references only when needed); deterministic steps belong to scripts/data, not model judgement | on-demand skill loading; skill choice via `routing.json`; planner reads `references/` only when a step depends on it |
| [Claude Code best practices](https://code.claude.com/docs/en/best-practices) | explore → plan → code; give Claude a way to verify and demand evidence; fix root causes, don't suppress errors; independent reviewer in fresh context; nothing outside task scope | planner/implementer split; "Done when" commands; Verification table with exit codes; ban on `@ts-ignore`/`.skip`; review left to separate agents |
| [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) (2024-12) | prompt chaining with gates; ground truth from the environment at each step | user approval between plan and code; per-step "Done when" run before the next step |
| [Multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) (2025-06) | delegation states objective, output format, boundaries; large outputs go through files, not the lead agent | Goal / Out of scope / "Not for…"; plan saved to `docs/plans/` and passed by path |
| [Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) (2025-09) | subagents return a condensed summary (~1–2k tokens); keep context lean | plan size target; no skill preload |
| [Model configuration](https://code.claude.com/docs/en/model-config) | `opusplan`: Opus for planning, Sonnet for execution (main session alias) | opus for planner, sonnet for implementer — by analogy |

Project rules (forbidden commands, do-not-touch paths, shared-contract sync, migrations,
test naming) come from [`CLAUDE.md`](../../CLAUDE.md) and each package's `AGENTS.md`,
not from the sources above. Not backed by an official source: "Not for …" in agent
descriptions (repo convention from the skills) and "test first where practical".

## Adding or changing an agent

- Frontmatter must start on line 1 with `name` and `description`, or the file is
  silently skipped; check with `claude plugin validate .claude/agents`.
- A new agents directory is picked up only after a session restart.
- Add a row to the catalog above; keep this file a map — details stay in the agent file.
