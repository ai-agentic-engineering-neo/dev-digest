# Skills

Reusable AI skills that provide specialized knowledge and workflows. Canonical location is `.claude/skills/` with a symlink at `.cursor/skills/ → ../.claude/skills` for Cursor compatibility. Shared with the team via version control.

## Catalog

| Skill | Scope | Description |
|-------|-------|-------------|
| [onion-architecture](onion-architecture/SKILL.md) | Backend | Ring model for `server/` — dependency rule, ports, DI, routes as adapters |
| [fastify-best-practices](fastify-best-practices/SKILL.md) | Backend | Fastify routes, plugins, JSON-schema validation, error handling |
| [drizzle-orm-patterns](drizzle-orm-patterns/SKILL.md) | Backend | Drizzle schema, queries, relations, transactions, migrations |
| [postgresql-table-design](postgresql-table-design/SKILL.md) | Backend | Postgres schema design, data types, indexing, constraints |
| [frontend-ui-architecture](frontend-ui-architecture/SKILL.md) | Frontend | Where code lives — folder layout, feature boundaries, thin routes, `use client` boundary |
| [next-best-practices](next-best-practices/SKILL.md) | Frontend | Next.js App Router, RSC boundaries, data fetching, optimization |
| [react-best-practices](react-best-practices/SKILL.md) | Frontend | React anti-patterns, state management, hooks rules |
| [react-testing-library](react-testing-library/SKILL.md) | Frontend | General-purpose React Testing Library guide with Vitest |
| [zod](zod/SKILL.md) | Full-stack | Zod schema validation, parsing, error handling, type inference |
| [typescript-expert](typescript-expert/SKILL.md) | Full-stack | Type-level programming, performance, tooling, migrations |
| [security](security/SKILL.md) | Full-stack | OWASP Top 10:2025, auth, injection, uploads, secrets |
| [mermaid-diagram](mermaid-diagram/SKILL.md) | Shared | Mermaid diagrams in markdown (flowcharts, sequence, ERD, …) |
| [pr-self-review](pr-self-review/SKILL.md) | Project | Pre-PR review of the local diff; routes the skills above, gates on deterministic checks |
| [repo-conventions-reviewer](repo-conventions-reviewer/SKILL.md) | Project | Extracts a repo's unwritten conventions with file:line evidence, or checks a diff against an accepted list; `evals/` holds its skill-creator eval fixtures |
| [engineering-insights](engineering-insights/SKILL.md) | Project | Logs non-obvious lessons to the touched module's `LEARNINGS.md` |
| [implement-plan](implement-plan/SKILL.md) | Project | Runs implementer → plan-verifier (gate) → architecture-reviewer (fix loop) for an existing plan; spec-creator, implementation-planner, test-writer run separately |
| [workflow-retro](workflow-retro/SKILL.md) | Project | Retrospective on a multi-agent run's orchestration — tokens, agent order, handoffs, recommendations; distinct from engineering-insights, which logs code lessons to LEARNINGS.md |

## What Are Skills?

Skills are modular packages that extend the AI agent with specialized knowledge and workflows. Unlike rules (always applied) or agents (invoked for specific tasks), skills are loaded on-demand when the agent determines they're relevant.

### Skills vs Rules vs Commands vs Agents

| Type | Scope | Loaded | Purpose |
|------|-------|--------|---------|
| **Rules** (`.mdc`) | Project conventions | Always or by file pattern | Persistent guardrails |
| **Commands** (`.md`) | User actions | On `/command` invocation | Slash commands |
| **Skills** (`.md`) | Domain knowledge | On-demand by agent | Specialized knowledge |
| **Agents** (`.md`) | Workflows | Via Task tool | Subagent orchestration |

## Creating New Skills

Each skill has:

- `SKILL.md` — Main skill file with rules and conventions (required)
- `examples.md` — Code examples showing good/bad patterns (recommended)
- `references.md` — Sources and rationale (optional)

## Testing a Skill (skill-creator evals)

When a skill is tested with skill-creator's with/without or old/new comparison
harness:

- **Fixtures and eval definitions are committed**, inside the skill's own
  folder — `<skill-name>/evals/{evals.json,fixtures/}` — so they ship and are
  deliverable with the skill, and are usable from CI later.
- **Run output is disposable and never committed.** It goes in a sibling
  directory named `<skill-name>-v-N/` (snapshots, per-run `outputs/`,
  `grading.json`, `benchmark.json`) — not `<skill-name>-workspace/`, an
  earlier naming this repo no longer uses.

### The `-v-N` number is per skill, not global

Each skill keeps its **own** count, independent of every other skill's:

- A skill's first comparison round is `<skill-name>-v-2`.
- If that same skill later gets a second round (a new rule added, a new
  fixture, another old-vs-new comparison), that round is `<skill-name>-v-3`
  — then `v-4`, and so on, for that skill specifically.
- A different skill getting its first-ever comparison round always starts
  at its own `v-2`, regardless of what number any other skill is on.
  `onion-architecture` being on `v-2` says nothing about what number
  `repo-conventions-reviewer` (or any other skill) starts at — each starts
  at `v-2` independently.

Current state: `onion-architecture-v-2` (1st round),
`repo-conventions-reviewer-v-2` (1st round) — both `v-2` at once is correct,
because they're two different skills' first rounds, not competing for one
shared number.

`.gitignore` covers the whole convention with one glob —
`.claude/skills/*-v-*/` — so a skill's first `-v-2` needs no `.gitignore`
edit, and neither does a later `-v-3` for the same skill.

Examples: [repo-conventions-reviewer/evals/](repo-conventions-reviewer/evals/)
(fixtures, committed) alongside `repo-conventions-reviewer-v-2/` (run output,
gitignored); `onion-architecture-v-2/` (run output only — this skill's
comparisons so far have used ad hoc fixtures in `server/src`, not a
committed `evals/` dir).
