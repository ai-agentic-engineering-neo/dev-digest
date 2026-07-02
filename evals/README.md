# evals

Evals for the DevDigest Claude Code harness — **skills** (`.claude/skills/*`), **subagents**
(`.claude/agents/*`), and **workflow-level** behavior (`CLAUDE.md` + on-disk config). Plain
**vitest + the Claude Agent SDK**, in the same toolchain as the rest of the repo (`pnpm`).

Runs on the Claude Code **subscription** — the API key is stripped from spawned processes, so
calls use the login / credential helper, never per-token API billing. No external services,
no third-party judge.

## Three tiers (methodology from the standard skill-eval setup)

1. **Static gate (no model)** — `pnpm eval:quality` checks SKILL.md structure/frontmatter/links.
2. **Quality evals (LLM-judged)** — per skill/agent, `*.eval.ts`, threshold-gated.
3. **Trend** — an optional local log + `pnpm eval:compare` to see version-over-version flips.

## Two ways to run a case (and why)

- **`skillTask` / `agentTask`** inject the artifact's content as the system prompt and load **no**
  on-disk config. This isolates the artifact's *content* — the right question for skill/agent
  quality. (This isolation relies on the SDK default `settingSources: []`, which does not read
  files from disk.)
- **`workflowTask`** loads the real harness (`settingSources: ["project"]` → `CLAUDE.md` + project
  skills/agents). This is the *systemic* tier: does a skill actually **activate**, does a subagent
  actually get **dispatched**, does `CLAUDE.md` change behavior? A local skill eval can't see this.

## Two scorers (both subscription-only)

- `patternMatch(output, expected)` — deterministic substring coverage, no model. Use it as a
  cheap first tier: don't pay the judge for what a substring settles.
- `llmJudge(output, practices)` — one structured `query()` → strict JSON, binary PASS/FAIL per
  practice, PASS only with a verbatim evidence quote (the LLM Message Pattern). The judge defaults
  to a **stronger family** (`EVAL_JUDGE_MODEL=claude-sonnet-5`) than the task (`claude-haiku-4-5`)
  to soften single-model self-preference. On a shared subscription the families still overlap —
  the real mitigations are *blind + binary + verbatim evidence*.

## Run

```bash
cd evals
pnpm install

pnpm eval:quality        # fast static gate (no model)
pnpm eval                # all quality + workflow evals
pnpm eval:skills         # just skills/
pnpm eval:agents         # just agents/
pnpm eval:workflow       # just workflow/
pnpm vitest run skills/onion-architecture   # one artifact

# fidelity run with a stronger task model
EVAL_MODEL=claude-sonnet-5 pnpm eval
```

| Env var | Default | Meaning |
|---------|---------|---------|
| `EVAL_MODEL` | `claude-haiku-4-5` | model under test (cheap by default) |
| `EVAL_JUDGE_MODEL` | `claude-sonnet-5` | judge model (stronger family) |
| `EVAL_MAX_TURNS` | `8` | max agent turns per case |

## Layout

```
evals/
  src/harness.ts        # runClaude() on the subscription; skill/agent/workflowTask; scorers
  src/skill-quality.ts  # static gate (CLI)
  src/compare.ts        # version-over-version flips (CLI)
  src/trend-reporter.ts # optional: logs each test's pass/fail to results/history.jsonl
  skills/<skill>/<skill>.eval.ts
  agents/<agent>/<agent>.eval.ts
  workflow/*.eval.ts    # dispatch, skill activation, negative control, CLAUDE.md effect
  <...>/fixtures/       # inputs a case needs
```

Add an eval by dropping in a `*.eval.ts` next to a fixtures folder. `vitest run` picks up
`**/*.eval.ts`.

## Which change → which run

| Change | Run |
|--------|-----|
| A skill's `SKILL.md` | `pnpm vitest run skills/<skill>` |
| A subagent file | `pnpm vitest run agents/<agent>` |
| `CLAUDE.md` / activation / dispatch | `pnpm eval:workflow` |
| Any artifact's structure | `pnpm eval:quality` |
| Model / Claude Code version | `pnpm eval` (whole suite) |

## Safety

Sessions run with `permissionMode: "bypassPermissions"`, so `workflowTask` keeps a **read-only
allow-list** (`Read, Grep, Glob, Task, Agent, Skill` — no `Bash`/`Write`/`Edit`). Don't copy the
bypass pattern into a context that grants write tools.
