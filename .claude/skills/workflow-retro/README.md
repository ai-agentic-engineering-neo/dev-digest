# Workflow Retro

A retrospective / post-mortem for a multi-agent run. After a workflow finishes — `/implement-plan`,
the `/spec` → `/plan-feature` → `/implement-plan` chain, or any batch of sub-agents — invoke this
skill to find out what it cost, where it struggled, what it wasted, and what to change next time,
then log a trend row so runs can be compared over time.

## Manual only

Never run automatically. Not wired to any hook (`Stop`/`SubagentStop`), not chained at the end of
`/implement-plan` or another skill, and must not be added to `.claude/settings.json` or
`.claude/hooks/`. Retros cost tokens — you choose when to spend them.

## Counts nested sub-agents

Sub-agents can spawn their own sub-agents — here `spec-creator` fans out `researcher`/`Explore`.
A parent's in-context `<usage>` excludes its children, so for runs that used a spawning agent the
skill prefers `deep` mode: journals are flat in `subagents/`, each with a `.meta.json` carrying
`agentType` + `spawnDepth` + `toolUseId`, so all depths are summed and children are linked to
their parent.

## What it does

Runs in the main session as the analyst. It does not re-run the workflow and does not edit agent
definitions or product code — it analyses and recommends. Applying a recommendation is a separate,
explicitly approved follow-up.

```
finished multi-agent run
  └─ scope the run            (which agents / which batch)
       └─ collect metrics      (in-context by default · `deep` parses JSONL journals)
            └─ analyse          (cost/resource + process + qualitative dimensions)
                 └─ recommend   (brief / duplication / concurrency / topology / cache / model)
                      └─ report to chat  +  one trend row → docs/retros/ledger.md
```

## When to invoke

`/workflow-retro` (optionally `label:<slug>`, `deep`, `scope:session`, `session:<id>`, `no-ledger`)

Phrases: "retro this run", "workflow retrospective", "analyze that multi-agent run",
"how did that workflow go".

## Inputs

| Token | Meaning | Default |
|-------|---------|---------|
| `label:<slug>` | Name for the run under review | derived from spec/plan slug + date |
| `deep` | Parse on-disk JSONL journals for exact token/cache/tool/timing data | off (in-context only) |
| `session:<id>` | Which session transcript to parse in deep mode | current session |
| `scope:last` / `scope:session` | Most recent agent batch, or every agent in the session | `last` |
| `no-ledger` | Print only; skip the ledger trend row | off |

## Data sources

| Source | When | Gives |
|--------|------|-------|
| In-context | default | `<usage>` per agent (tokens, tool_uses, duration), launch order, parallelism, `SendMessage` round-trips, reports — zero file reads |
| Deep (JSONL) | `deep` flag | exact per-request input/output/cache-read/cache-write tokens, tool calls, tool errors, timestamps, parallelism factor, parent→child tree — via `scripts/analyze_journals.py` |

Journals live at `~/.claude/projects/<slug>/<session-id>/subagents/agent-*.jsonl` and the main
`~/.claude/projects/<slug>/<session-id>.jsonl`. The slug for this repo is
`-Users-serhiibilous-Documents-GoIt-AI-Agentic-dev-digest`; sessions started from a subdirectory
(e.g. `mcp-server/`) live under their own slug.

```bash
python3 .claude/skills/workflow-retro/scripts/analyze_journals.py \
  "$HOME/.claude/projects/<slug>/<session-id>/subagents/agent-*.jsonl" \
  --main "$HOME/.claude/projects/<slug>/<session-id>.jsonl" --since <ISO> --prices prices.json
```

The helper deduplicates usage per `requestId` (Claude Code writes one journal line per content
block, each repeating the response's `usage`).

## Dimensions measured

- **Cost & resources:** tokens (in/out/cache), cache efficiency, tool calls/errors, durations,
  agent count, launch order, parallelism factor, critical path, cost, cost-per-useful-output.
- **Process & effectiveness:** clarifying round-trips, rework/fix-loops, delegation correctness,
  scope drift (owned files, `vendor/`, `server/clones/`), failure taxonomy.
- **Qualitative:** what was hard, what was easy, duplicated context, what was missed.

## Output

- Full report to chat (metrics table + well/hard/wasteful + actionable recommendations).
- One trend row appended to `docs/retros/ledger.md` (created if missing) — the only file write.
- An offer to apply a recommendation (never applied automatically).

## Cost estimate

Pricing is not hard-coded — it drifts. Confirm current per-model rates via the `claude-api` skill
and pass them with `--prices prices.json` (USD per MTok, keyed by model id or prefix). Without
prices, cost shows `n/a`.

## Files

```
workflow-retro/
├── SKILL.md                  ← analyst — scope → collect → analyse → recommend → report
├── tile.json                 ← skill metadata
├── README.md                 ← this file
└── scripts/
    └── analyze_journals.py   ← read-only, stdlib-only JSONL parser for `deep` mode
```

## Relationship to other skills

- `/implement-plan` builds a feature (implementors → verify → `plan-verifier` → review + tests →
  fix loop). `workflow-retro` looks back at how that run performed.
- `engineering-insights` records durable *technical* discoveries in `<module>/INSIGHTS.md`.
  `workflow-retro` is about the *run/process*; its durable output is `docs/retros/ledger.md`.
