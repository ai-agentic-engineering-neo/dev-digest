---
name: workflow-retro
description: >
  Post-workflow retrospective for multi-agent sessions. Reconstructs the full
  agent sequence, measures cache efficiency / parallelism / cost, detects
  context duplication and gaps, and produces concrete actionable recommendations.
  Writes a one-row summary to docs/retros/ledger.md; full analysis goes to chat.
  Trigger phrases: "workflow retro", "agent retro", "session retrospective",
  "/workflow-retro", "how did the workflow go", "ретроспектива", "recap agents",
  "what agents ran", "summarize the session", "workflow insights", "retro".
  Usage: /workflow-retro
---

# Workflow Retro Skill

> Post-mortem for any session where 2+ subagents ran.
> 3 phases: collect → analyse → recommend.
> Output: compact dashboard in chat + one ledger row appended to `docs/retros/ledger.md`.

---

## Invocation

```
/workflow-retro
```

If fewer than 2 Agent tool calls are found in the session → output "Session too small for retro (< 2 agents). Skipping." and stop.

---

## Phase 1 — Collect

### 1a. Reconstruct agent sequence from conversation

Walk the conversation and collect every Agent tool call. Note for each:
- agent type (subagent_type)
- prompt summary (≤15 words)
- parallel with which other agent (if any)
- status: ✅ success / ⚠️ partial / ❌ failed
- depth: 1 = spawned by orchestrator, 2 = spawned by another agent

This sequence is used to determine depth and parallelism for the metrics table.

### 1b. Load pricing (daily cache)

Before any cost calculation, load current model prices:

**Step 1.** Read `.devdigest/cache/model-prices.json` (in project root) if it exists.

**Step 2.** Check `fetched_at` timestamp:
- File exists AND `fetched_at` is less than 24h ago → use cached prices, skip to Step 5
- File missing OR older than 24h → proceed to Step 3

**Step 3.** WebFetch Anthropic's pricing page and parse rates for every model that appears in the
jsonl (`message.model` of assistant entries — e.g. the Opus orchestrator and Sonnet subagents):
`input`, `output`, `cache_read`, `cache_creation` (USD per million tokens).

**Step 4.** Write updated cache to `.devdigest/cache/model-prices.json`:
```json
{
  "fetched_at": "2026-07-02T14:00:00Z",
  "claude-sonnet-4-6": {
    "input": 3.00,
    "output": 15.00,
    "cache_read": 0.30,
    "cache_creation": 3.75
  }
}
```

**Step 5.** If WebFetch or parse failed → use hardcoded fallback rates and note:
`⚠️ Could not refresh prices — using hardcoded 2026-07 rates`

### 1c. Parse jsonl journal (always)

Locate the current session's transcript and its subagents:
```bash
ls -t ~/.claude/projects/*/[0-9a-f]*.jsonl 2>/dev/null | head -1
# subagents of that session: <session-id>/subagents/agent-<id>.jsonl (+ agent-<id>.meta.json:
# agentType, description, toolUseId → links to the orchestrator's Agent call)
```
A session continued after context compaction may span several `.jsonl` files — include all of them.
Never copy raw transcript text into the report or ledger (it can contain tokens / `.env` values):
numbers, paths and one-line summaries only.

If no journal found → output `⚠️ jsonl not found — token columns N/A, span/tools estimated from context` and fill those columns with `N/A`.

From the journal, for each agent block (grouped by subagent conversation boundaries):

**Tokens** — sum the `usage` objects of `"type":"assistant"` entries, **once per unique `message.id`**
(one model response is written as several lines — one per content block — all carrying the same
`usage`; summing lines double- or triple-counts). Price each response at its own `message.model`:
```json
{
  "input_tokens": 12400,
  "output_tokens": 890,
  "cache_read_input_tokens": 9800,
  "cache_creation_input_tokens": 2600
}
```

**Tools** — count all `"type":"tool_use"` entries in that agent's block.

**Span** — difference between first and last `timestamp` in the agent's block, in seconds.

**Agent ID** — first 8 characters of the subagent conversation ID.

**Depth** — determined from 1a: 1 if spawned by orchestrator, 2 if spawned by another agent.

If an agent block has no `usage` entries (interrupted) → mark its token columns as `N/A (interrupted)`.
Add note: `⚠️ Partial data — N agent(s) interrupted.`

**Cost formula** (using prices from 1b):
```
cost = (in × prices.input + out × prices.output
      + cache_read × prices.cache_read
      + cache_creation × prices.cache_creation) / 1_000_000
```

**hit%**:
```
cache_read / (cache_read + cache_creation + in) × 100
```

**Parallelism factor**:
```
sum(all agent spans) / wall-clock span of entire session
```

---

## Phase 2 — Analyse

### 2a. Context duplication

For each file that appears in 2+ agents' Read/Glob/Grep calls:
```
DUPLICATION: server/docs/architecture.md
  Read by: spec-creator (#1), implementation-planner (#2)
  Est. wasted tokens: ~3,000
  Fix: pass architecture summary from spec-creator output into implementation-planner prompt
```

### 2b. Round-trip count

Count per agent: how many times it issued a **clarification request** (re-asked the orchestrator for more context) OR **retried the same tool call** with the same arguments.
Additional Read/Grep calls for thorough research are NOT counted as round-trips.

```
round-trips: spec-creator=0, implementation-planner=1, implementer-backend=2 ← HIGH
```
Any agent with round-trips ≥ 2 → flag as "under-briefed prompt".

### 2c. Delegation / scope drift

Check each agent invocation:
- Did the agent do work outside its documented scope?
- Did owned-paths in the plan match what was actually modified?

```
SCOPE DRIFT: implementer-backend re-read SPEC and PLAN in full (3 Glob + 5 Read)
  Expected: receive owned paths + task list from orchestrator
  Fix: add owned-paths summary to implementer prompt in run-plan PHASE 1
```

### 2d. Toxic events

Any of:
- Terminal tool error (not retried successfully)
- `blocked-on-human` event
- Same tool call repeated 3+ times with same args

```
TOXIC: implementer-frontend ran pnpm typecheck 3× before fixing import error
  Root cause: typecheck output not re-read after fix attempt 1
  Fix: implementer SKILL should re-read typecheck output before retry #2
```

### 2e. Gap detection

Bash IS ALLOWED here for read-only checks (diff, ls, find, grep). Write commands remain forbidden.

Check for missing steps:
- [ ] INSIGHTS.md updated after substantive changes? (grep for recent `engineering-insights` skill call)
- [ ] shared contracts diff-checked? (`diff client/src/vendor/shared/ server/src/vendor/shared/`)
- [ ] test-writer run (if plan required it)?
- [ ] Any AC from plan-viewer marked MISSING with no follow-up action?

Each gap:
```
GAP: engineering-insights skill not called after 6 files modified
  Risk: session discoveries not recorded for future agents
  Owner: orchestrator (run-plan Phase 4 or user)
  Fix: add engineering-insights call to run-plan PHASE 4 summary checklist
```

---

## Phase 3 — Recommend

Each recommendation must name a **specific agent or file** and contain **specific text** — no vague suggestions.

**Tier 1 — Agent prompt improvements** (highest ROI):
```
AGENT: implementation-planner.md
CHANGE: In STEP 0, add: "If a spec file exists for this plan, read it first and
  extract: affected modules, key constraints, existing patterns noted by spec-creator.
  Do NOT re-read files already summarised in the spec."
WHY: implementation-planner re-read server/docs/architecture.md independently (~3k wasted tokens)
```

**Tier 2 — Workflow structure** (medium ROI):
```
WORKFLOW: run-plan SKILL.md — Phase 1
CHANGE: After spawning parallel implementers, pass to each:
  "Files already read by spec-creator: <list>. Do not re-read these; use the PLAN summary instead."
WHY: 4 of 7 agents re-read the same architecture docs
```

**Tier 3 — Process / orchestration** (low-hanging fruit):
```
PROCESS: parallelism under-used (factor 0.82 < 1.5 threshold)
CHANGE: architecture-reviewer and plan-viewer can run in parallel —
  they read the same diff but produce independent outputs
```

---

## Output format

Output is a **compact dashboard** — no long narrative sections.

### Header (2 lines)

```
Workflow Retro — {short workflow name}
Run: {description} · {N} agents · mode: {single-fan-out|parallel|sequential} · prices: {refreshed HH:MM|hardcoded fallback}
```

### Metrics table

```
| agent    | role         | depth | in     | out    | cache-read  | hit% | tools | span  | cost  |
|----------|--------------|-------|--------|--------|-------------|------|-------|-------|-------|
| a00eb81a | spec-creator | 1     | 32,828 | 51,112 | 2,053,240   | 72%  | 20    | 1373s | $7.15 |
| L a14e0e4d | researcher | 2     | 51     | 8,027  | 1,913,785   | 93%  | 40    | 149s  | $1.24 |
| L a9873876 | researcher | 2     | 41     | 4,988  |   750,216   | 81%  | 24    | 96s   | $0.95 |
```

Column rules:
- `agent` — first 8 chars of subagent conversation ID (from jsonl)
- `role` — subagent_type
- `depth` — 1 = spawned by orchestrator; 2+ = spawned by another agent, prefix with `L ` (add extra space per level)
- `in` — `usage.input_tokens` summed across agent block
- `out` — `usage.output_tokens` summed across agent block
- `cache-read` — `usage.cache_read_input_tokens` summed across agent block
- `hit%` — `cache_read / (cache_read + cache_creation + in) × 100`; if < 60% → show as `49% ⚠️`
- `tools` — count of `tool_use` entries in agent block
- `span` — last timestamp minus first timestamp in agent block, in seconds
- `cost` — computed using prices from Phase 1b

If jsonl unavailable → fill `in`, `out`, `cache-read`, `hit%`, `cost` with `N/A`; fill `span` and `tools` from task notifications if available.

### Totals line

```
Totals: in: X · out: X · cache-read: XM · hit%: X% · tools: X · wall: Xs · parallelism: Xx · cost: $X · savings: ~$X · web: N search · N fetch
```

- `savings` = `cache_read_tokens × (prices.input - prices.cache_read) / 1_000_000` (how much cache saved vs uncached baseline)
- `web` — from `server_tool_use.web_search_requests` + `web_fetch_requests` in jsonl; omit entire `web:` segment if both are 0

### Critical path line

```
Critical path: {agent-role} / {agentId} ({X}% of wall) · {optional caveat}
```

### Analysis block (compact, only if findings exist)

```
Duplications (N): {file} read by {agentA}, {agentB} — est. waste: ~Xk tokens
Round-trips: {role}/{agentId}=N ⚠️ under-briefed
Scope drift: {one line}
Toxic: {one line}
Gaps (N): {one line each}
```

If no findings in a category → omit that line entirely.

### Action items (always last)

```
Action items:
- [ ] {specific file}: {specific change}  ← Tier 1
- [ ] {specific file}: {specific change}  ← Tier 2
- [ ] {specific action}                   ← Tier 3
```

Max 5 items. Each must name a specific file or owner.

---

### Ledger row (append to `docs/retros/ledger.md`)

After the dashboard output, append one row:

```
| {date HH:MM} | {workflow name} | {plan/spec name or "—"} | {N agents} | ~${cost} | {hit%} | {parallelism} | {bottleneck role/agentId} | {N duplications} | {N gaps} | {overall ✅/⚠️/❌} |
```

If `docs/retros/ledger.md` does not exist → create it with the header first.

---

## Rules

- **NEVER edit agent or skill files** — write recommendations only, never apply them
- **Source**: copied from the course reference fork (yudbox/dev-digest, 2026-07-03) and adapted 2026-11-08: per-`message.id` token dedup, per-model prices, subagent files, compaction, no raw transcript text.
- **NEVER skip Phase 2** — duplication and gap analysis are the core value
- **ALWAYS parse jsonl** — it is the single source of truth for token metrics
- **ALWAYS load prices from `.devdigest/cache/model-prices.json`** (project root) before cost calculation; refresh if older than 24h
- **NEVER write vague recommendations** — every recommendation names a specific file and specific text
- **ALWAYS end with the Action items checklist** — ≤5 items, each assignable to a file
- **Append to ledger, never overwrite** — one new row per invocation
- **If < 2 agents ran** → "Session too small for retro (< 2 agents). Skipping." and stop
