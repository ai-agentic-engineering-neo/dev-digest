---
name: workflow-retro
description: >
  Post-mortem / retrospective for a finished multi-agent run in DevDigest — the SDD chain
  (/spec → /plan-feature → /implement-plan), a single /implement-plan build, or any batch of
  sub-agents (implementor, test-writer, architecture-reviewer, researcher, Explore, …).
  Gathers cost & resource metrics (tokens, cache efficiency, tool calls, durations, agent
  count incl. nested sub-agents, launch order, parallelism), reconstructs qualitative
  insights (what was hard, what was easy, duplicated context, what was missed), and ends
  with concrete recommendations (sharpen an agent's brief, pre-read a shared file once,
  merge/split agents, change batch size). Outputs a full report to chat and appends one
  trend row to docs/retros/ledger.md.
  TRIGGER only when explicitly asked: "/workflow-retro", "retro this run", "workflow
  retrospective", "analyze that multi-agent run", "how did that workflow go".
  Does NOT cover: recording technical/code lessons into a module INSIGHTS.md (that is
  `engineering-insights`, even though it also answers to "retro"), running the workflow,
  editing product code, pushing/merging.
---

# Workflow Retro — retrospective for a multi-agent run

> **Hand me a finished multi-agent run and I tell you what it cost, where it struggled, what it
> wasted, and exactly what to change next time — then log a trend row so runs can be compared.**

You are the **analyst**, running in the main session. The workflow already ran; your job is to
look back at it. You read metrics and reports, reason about them, and produce a report plus
recommendations. **You do not re-run the workflow and you do not edit agent/skill/command
definitions or product code** — you *recommend* changes and, if the user says yes, applying them
is a separate follow-up step.

## Manual only — never automatic

This skill is **invoked by hand**, on demand, after a run the user wants to review. There is **no
hook and there must never be one**: do not wire it to a `Stop`/`SubagentStop`/`PreToolUse` event,
do not chain it at the end of `/implement-plan` or any other command/skill, and do not register it
in `.claude/settings.json` or `.claude/hooks/`. If you ever see it auto-triggering, that is a bug —
stop and tell the user.

`engineering-insights` and this skill are different things: that one records durable *code*
knowledge into `<module>/INSIGHTS.md`; this one reviews *how the run went*. A process lesson goes
to the ledger, not to `INSIGHTS.md`. If the user says just "retro" at the end of a task, ask which
one they mean.

## DevDigest workflow map (what a run looks like here)

| Entry point | Agents it dispatches | Notes |
|-------------|----------------------|-------|
| `/spec` | `spec-creator` | **Spawns nested** `researcher` / `Explore` (its `Agent(researcher, Explore)` tool). Relays Blocking questions → `AskUserQuestion` → `SendMessage` resume. |
| `/plan-feature` | `implementation-planner` | Two-phase: Phase 1 questions relayed to the user, then resumed. Read-only, cannot spawn. Plan saved to `docs/plans/`. |
| `/implement-plan` | `implementor` ×N (batches of ≤4, optionally `isolation: "worktree"`), then `plan-verifier` (forked context), `architecture-reviewer`, `test-writer`, fix loop, final gates | Orchestration rules in `.claude/commands/implement-plan.md`. Verification via `scripts/verify.sh <pkg> --full`. |
| ad hoc | `researcher`, `Explore`, `general-purpose`, `Plan`, … | Any batch the main session launched. |

Use this map to judge **delegation correctness** (right agent for the task) and **topology**
(e.g. implementors in a batch that should have been one step, or a planner phase that needed a
third round-trip). Read the relevant command / agent file only when a finding needs it — not
up front.

## Count nested sub-agents (do not undercount)

A sub-agent can spawn its **own** sub-agents. In this repo that is `spec-creator` (fans out
`researcher`/`Explore`); any `general-purpose`/`claude` agent can too. Nested agents consume real
tokens and tool calls and **must be included** in the per-agent breakdown and every total.

- **Easy to miss in-context.** A parent's `<usage>` block reports only the parent's own tokens,
  not its children's. A `/spec` run that looks like "1 agent / ~75k" in-context can really be
  5 agents (1 `spec-creator` + 4 nested `researcher`s) at a far higher total.
- **Deep mode catches them.** Journals are stored **flat** in `subagents/`, so an
  `agent-*.jsonl` glob includes every nesting level. Each has a sibling `.meta.json` with
  `agentType`, `description`, `toolUseId` and **`spawnDepth`** (1 = spawned by the main session,
  > 1 = nested). The helper links each child to the parent whose `tool_use` id matches its
  `toolUseId`, indents it, and **sums all depths into the totals** (`nested=`, `max_depth=`).
- **Rule:** if the run included `/spec`/`spec-creator` or any agent that can spawn — or you are
  unsure — prefer `deep`, or at minimum state in the report that in-context totals exclude
  nested agents.

## Inputs (args)

| Token | Meaning | Default |
|-------|---------|---------|
| `label:<slug>` | Name for this retro (the run under review). | derived from the run, e.g. the spec/plan slug + date |
| `deep` | Parse on-disk JSONL journals for exact token / cache / tool / timing data. | off (in-context metrics only) |
| `session:<id>` | Which session transcript to analyse in `deep` mode. | the current session |
| `scope:last` / `scope:session` | Just the most recent agent batch, or every agent in the session. | `last` |
| `no-ledger` | Print the report only; do not append a trend row. | off (ledger row is written) |

If it is ambiguous *which* run to review (several distinct batches in one session), ask before
analysing — do not silently pick.

## Data sources (both are real; prefer the cheap one)

1. **In-context (default).** As orchestrator you saw every `Agent` result's `<usage>` block
   (`subagent_tokens`, `tool_uses`, `duration_ms`), every `<task-notification>`, the launch
   order, which agents were dispatched in the same message (parallel), every `SendMessage`
   resume (= a clarifying round-trip), and each agent's final report. Enough for a solid retro
   with **zero file reads**.
2. **Deep (`deep` flag).** Parse the JSONL journals:
   - Project slug = the absolute cwd with every `/` (and `_`) replaced by `-`. For this repo:
     `-Users-serhiibilous-Documents-GoIt-AI-Agentic-dev-digest`. **A session started from a
     subdirectory gets its own slug** (e.g. `…-dev-digest-mcp-server`) — check there too if the
     run was launched from `mcp-server/` or another package.
   - Sub-agent journals: `~/.claude/projects/<slug>/<session-id>/subagents/agent-*.jsonl`
   - Main session transcript: `~/.claude/projects/<slug>/<session-id>.jsonl`
   - Current session id: the most recently modified `*.jsonl` directly under
     `~/.claude/projects/<slug>/` (or the session id in the scratchpad path).
   - Run the bundled helper (read-only, stdlib-only, Python 3):
     ```bash
     python3 .claude/skills/workflow-retro/scripts/analyze_journals.py \
       "$HOME/.claude/projects/<slug>/<session-id>/subagents/agent-*.jsonl" \
       --main "$HOME/.claude/projects/<slug>/<session-id>.jsonl" \
       [--since <ISO>] [--until <ISO>] [--prices <file>] [--json]
     ```
   - For `scope:last`, pass `--since` = the timestamp just before the batch was launched, so
     earlier agents in the same session are excluded.
   - Output: per-agent and total tokens (in / out / cache-read / cache-write), **cache hit
     ratio**, tool calls, tool errors, span, critical path, and **parallelism factor**
     (Σ agent spans ÷ wall-clock). `--main` adds the orchestrator's own row (reported separately,
     never summed into sub-agent totals).
   - The helper deduplicates usage per `requestId` — Claude Code writes one line per content
     block, each repeating the same `usage`. Do not "fix" totals by summing raw lines.
   - **Cost:** do not hard-code prices. Confirm current per-model rates with the `claude-api`
     skill, write them to a scratchpad `prices.json`
     (`{"<model-id-or-prefix>": {"input": .., "output": .., "cache_read": .., "cache_write": ..}}`,
     USD per MTok), pass `--prices`. Without verified prices, cost is `n/a`.

## What to measure (the dimensions)

Collect what you can; mark anything unavailable as `n/a` rather than guessing.

**Cost & resources (quantitative)**
- Tokens — input / output / cache-read / cache-creation, **per agent and total**.
- **Cache efficiency** = cache-read ÷ (input + cache-read + cache-creation). Low ratio =
  something is breaking the prompt cache (a big cost lever).
- Tool calls and tool errors per agent and total.
- Wall-clock per agent and total; **parallelism factor**.
- **Critical path** — the agent that dominated wall-clock.
- Cost ($) per agent and total (only with verified prices), plus **cost per useful output**
  ($/spec, $/plan, $/implemented step, $/finding fixed) — a better signal than raw spend.

**Process & effectiveness**
- Agent count **including nested** (report "N agents: X top-level + Y nested"), **launch order**,
  and the parallelism map. For `/implement-plan`, check batches actually ran ≤4-wide in one
  message as the plan's Execution guidance asked.
- **Clarifying round-trips** — `SendMessage` resumes of `spec-creator` / `implementation-planner`,
  re-prompts, corrections. High = underspecified brief or under-researched spec.
- Rework — fix-loop iterations in `/implement-plan`, red `verify.sh` gates, relaunched steps,
  `Status: blocked` implementor reports.
- Delegation correctness & scope drift — right agent type per task; implementors stayed inside
  their step's owned files; nobody touched `server/clones/**`, `**/src/vendor/**` (outside a
  deliberate `vendor/shared` contract change) or lockfiles; correct package manager per package.
- **Failure taxonomy** — API errors, tool denials / hook blocks (e.g. the spec-path hook),
  Docker-lane `SKIP`s, blocked-on-human; categorise so recurring friction surfaces.

**Qualitative insights**
- **What was hard** — where agents stalled, looped, or asked questions.
- **What was easy** — what went cleanly first try.
- **Duplicated information** — the same large file read by several agents (typical here:
  `CLAUDE.md`-referenced READMEs, `<module>/INSIGHTS.md`, `server/src/vendor/shared/contracts/*`,
  the spec itself) → candidates for one shared pre-read or an excerpt in the brief.
- **What was missed** — gaps caught only afterwards by `plan-verifier`, `architecture-reviewer`,
  `pr-self-review`, or the human.

## Method

1. **Scope the run.** Decide which agents this retro covers (`scope`, or ask if ambiguous). List
   them with their roles, using the workflow map above.
2. **Collect metrics.** In-context by default; with `deep`, locate the journals and run the
   helper. Build the per-agent table + totals.
3. **Analyse** across the dimensions. Keep *quantitative* findings (from the table) separate from
   *qualitative* ones (from reports and your own observation of the run).
4. **Recommend.** Turn each finding into a concrete, owned action (see below). Name the agent
   file, command, skill, or parameter, and the expected effect.
5. **Output** the report to chat. Unless `no-ledger`, append one row to `docs/retros/ledger.md`
   (create it with the header below if missing). Optionally write a full per-run report to
   `docs/retros/YYYY-MM-DD-<label>.md` if the user asks. These are the **only** file writes.
6. **Offer**, but do not perform, the follow-up: "want me to apply recommendation X?"

## Recommendations — make them actionable

Each one names a target, a change, and the expected payoff. Shapes:

- *Brief:* "`implementor` for step 3 needed 2 round-trips on owned paths — have
  `implementation-planner` list sibling steps' owned files in every step." → fewer round-trips.
- *Duplication:* "3 implementors each read `server/README.md` (~4k tok ×3) — put the relevant
  excerpt in the step text in `.claude/commands/implement-plan.md`." → ~8k tokens saved per run.
- *Concurrency:* "review agents ran serially but have disjoint inputs — dispatch
  `architecture-reviewer` and `test-writer` in one message." → wall-clock from Σ to max.
- *Topology:* "agents A and B always run back-to-back on the same files — merge the plan steps." /
  "`researcher` X did two unrelated jobs — split."
- *Cache:* "cache hit 38% on `spec-creator` — a dynamic block precedes the stable prompt; reorder
  so the stable prefix is cached."
- *Model choice:* "`researcher` on Opus did pure file lookup — pin a cheaper model in its
  frontmatter (see `docs/agent-prompts/`)."

## Output format (report)

```
## Workflow Retro — <label>

**Run:** <what ran> · <N> agents (<X> top-level + <Y> nested) · mode <multi|single> · data: <in-context | deep>

### Metrics
| agent | role | model | in | out | cache-read | hit% | tools | span | cost |
|-------|------|-------|----|-----|------------|------|-------|------|------|
| …     | …    | …     | …  | …   | …          | …    | …     | …    | …    |
**Totals:** in <…> · out <…> · cache hit <…>% · tools <…> · wall <…>s · parallelism <…>x · cost <…>
**Orchestrator (main session):** <tokens / n/a — not included in totals>
**Launch order:** A → (B ‖ C) → D     **Critical path:** <agent> (<…>s)

### What went well
- <…>

### What was hard / wasteful
- <difficulty / stall> — <evidence>
- <duplicated context> — <which agents, ~tokens>
- <what was missed> — <caught when / by whom>

### Recommendations (actionable)
1. <target> — <change> → <expected effect>
2. …

### Ledger
Appended to `docs/retros/ledger.md` (row: <date> · <label> · agents · tokens · cost · parallelism).
```

### Ledger format (`docs/retros/ledger.md`)

Create with this header if missing, then append one row per retro:

```
# Workflow retro ledger

One row per `/workflow-retro` run, so multi-agent runs can be compared over time.
Written only by the `workflow-retro` skill.

| date | label | agents | in→out tok | cache hit | wall | parallelism | cost | top recommendation |
|------|-------|--------|-----------|-----------|------|-------------|------|--------------------|
```

`agents` is written as `total (top+nested)`, e.g. `5 (1+4)`. Use `n/a` for anything not measured.

## When you cannot proceed

If no multi-agent run is identifiable in scope, or `deep` is requested but the journals cannot be
located (check the subdirectory slugs too), say so plainly and offer the in-context retro instead.
A clear "nothing to retro / journals not found, here's the in-context view" is a valid result — a
fabricated metric is not.
