# Agents

Project subagents for DevDigest. This file is a map of the set: what each agent
is for, what it may touch, and what goes in and comes out. The rules themselves
live in each agent file — read that file before changing an agent.

## At a glance

| Agent | Model | Responsibility | Writes | Runs |
|-------|-------|----------------|--------|------|
| [researcher](researcher.md) | sonnet | Find facts in the repo or on the web | nothing | alone, on demand |
| [planner](planner.md) | opus | Turn a feature request into a Development Plan | one plan file | once per feature |
| [implementer](implementer.md) | sonnet | Implement one plan task, backend or frontend | the task's own files | many in parallel |
| [test-writer](test-writer.md) | sonnet | Write tests only for one `Agent: test-writer` task, or an on-demand brief | the task's own test files | inside the waves, alongside implementers |
| [architecture-reviewer](architecture-reviewer.md) | opus | Read-only onion / layer boundary review with `file:line` evidence | nothing | after a wave, or after the last wave |
| [plan-verifier](plan-verifier.md) | opus | Read-only check of finished code against every plan item | nothing | after the last wave, in parallel with architecture-reviewer |
| [doc-writer](doc-writer.md) | sonnet | Turn a shipped feature into documentation in the right place | documentation paths only | after both checks pass |

Flow: `researcher` (optional) → `planner` → user reviews the plan → waves of
`implementer` × N + `test-writer` tasks → `architecture-reviewer` ∥
`plan-verifier` → fix tasks for implementers when either reports a gap,
re-dispatch and re-verify → `doc-writer` → `engineering-insights` capture →
user runs `/pr-self-review`.
The execution protocol and the plan template: [`docs/plans/README.md`](../../docs/plans/README.md).

## researcher

- **Responsibility:** answer one concrete question about the codebase, its
  history, or external libraries/standards. Never changes anything.
- **Permissions:** `Read, Grep, Glob, Bash, WebSearch, WebFetch`. Bash is
  read-only by rule (no redirects, installs, git writes, DB or docker). No
  `Agent`, no deep-research fan-out.
- **Input:** a precise brief. The caller interviews the user first
  (AskUserQuestion) when the request is vague about scope, target or depth.
- **Output:** a report in a fixed structure — mode (project / web / mixed),
  status `FOUND | PARTIAL | NOT FOUND | NEEDS CLARIFICATION`, confidence,
  findings with `path:line` or URL + date, and an explicit *Not found* list.

## planner

- **Responsibility:** read curated knowledge, load the skills, explore the code
  and write a Development Plan that implementers can run in parallel on one
  feature branch. Never writes code.
- **Permissions:** `Read, Grep, Glob, Bash, Skill, Write`. `Write` only for
  `docs/plans/<YYYY-MM-DD>-<topic>.md`; Bash read-only. No `Edit`, no `Agent`.
- **Skills:** the same backend and frontend sets as the implementer, loaded by
  explicit `Skill` calls for every area the feature touches; plus
  `engineering-insights` (read) and `mermaid-diagram`.
- **Input:** a feature request, optionally a researcher report.
- **Output:**
  - `docs/plans/<date>-<topic>.md` — goal, context (INSIGHTS / spec entries),
    scope, design with a Mermaid diagram, contracts, DB, and tasks `T001…`
    grouped in waves, each with area, exclusive files, dependencies, `[P]`,
    skills, acceptance criteria and verify commands, plus an ownership table;
  - a short status to the caller: `PLANNED | NEEDS CLARIFICATION`, wave counts,
    skills loaded, open questions.

## implementer

- **Responsibility:** implement exactly one task of a plan — backend
  (`server/`, `reviewer-core/`) or frontend (`client/`, `e2e/`) — test-first,
  verified, inside the task's own files. Several instances share one working
  tree on the current feature branch.
- **Permissions:** `Read, Edit, Write, Grep, Glob, Bash, Skill`. No git writes
  (the main session commits), no installs, no `db:migrate` / `db:seed` /
  docker; `db:generate` only when the task owns the schema. No `Agent`. Does not
  write `INSIGHTS.md`.
- **Skills (all mandatory for the area, loaded before any code):**
  - backend — `onion-architecture`, `fastify-best-practices`,
    `drizzle-orm-patterns`, `postgresql-table-design`, `zod`,
    `typescript-expert`, `security`;
  - frontend — `frontend-ui-architecture`, `react-best-practices`,
    `next-best-practices`, `react-testing-library`, `zod`,
    `typescript-expert`, `security`.
- **Input:** a plan path and a task ID.
- **Output:** the task's files changed in the working tree (uncommitted) and a
  report: status `DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED`, skills
  loaded, routing rows applied, files changed, verification commands with
  results, foreign errors, deviations, insight candidates.

## test-writer

- **Responsibility:** write tests only — backend (`server/`, `reviewer-core/`)
  or frontend (`client/`, `e2e/`) — for one Development Plan task marked
  `Agent: test-writer`, or for one on-demand brief that names the target
  behaviour and an explicit file list. Fail-first, plus a mutation check per
  test. Never edits production code, never commits.
- **Permissions:** `Read, Edit, Write, Grep, Glob, Bash, Skill`. Write scope is
  test files only (`server/test/**`, `server/src/**/*.test.ts`,
  `client/src/**/*.test.ts(x)`, `reviewer-core/**/*.test.ts`,
  `e2e/specs/*.flow.json`), plus shared test infrastructure only when the task
  lists it explicitly. No git writes, no installs, no shared-state commands.
- **Skills:** the same backend and frontend sets as the implementer, loaded by
  explicit `Skill` calls, applying the union of `routing.md` rows for the test
  files and the production files under test.
- **Input:** a plan path and a task ID marked `Agent: test-writer`, or a brief
  with the target behaviour and file list.
- **Output:** the task's test files (uncommitted) and a report: status
  `DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED` (`BLOCKED` when a test
  exposes a real production defect, left failing and uncommitted), plus
  `Tests added`, `Fail-first evidence`, `Mutation check`, `Mocks used`,
  `Defects found`.

## architecture-reviewer

- **Responsibility:** read-only review of architectural boundaries in a change
  — onion rings and import direction in `server/`, domain purity in
  `reviewer-core/`, layer placement and the client/server boundary in
  `client/`. Runs deterministic checks first, then reads only what those tools
  cannot express. Never replaces `/pr-self-review`.
- **Permissions:** `Read, Grep, Glob, Bash, Skill` — no `Write`, no `Edit`.
  Bash is read-only by rule, the same allow-list `researcher.md` uses, plus
  `pnpm run arch:check`, `pnpm run typecheck` and
  [`pr-self-review/scripts/precheck.sh`](../skills/pr-self-review/scripts/precheck.sh).
- **Skills:** `onion-architecture` when the scope has `server/**` or
  `reviewer-core/**`; `frontend-ui-architecture` and `next-best-practices` when
  it has `client/**`; only the architecture rows of
  [`routing.md`](../skills/pr-self-review/references/routing.md).
- **Input:** a scope — a base ref (default `main`) or an explicit path list —
  and optionally a plan path, to know which ring the plan intended for each file.
- **Output:** a report — `Status: PASS | BLOCKED | NEEDS_CONTEXT`, scope, skills
  loaded, a *Deterministic results* table, findings in the
  [`reviewer-brief.md`](../skills/pr-self-review/references/reviewer-brief.md)
  shape plus `confidence` (≥ 80 to report), *Signals*, *Not reviewed* and
  *Known debt touched*.

## plan-verifier

- **Responsibility:** check finished code against every requirement, task and
  acceptance criterion of one Development Plan, with evidence per verdict, and
  list any code the plan did not ask for. Judges compliance only, never
  quality or architecture.
- **Permissions:** `Read, Grep, Glob, Bash` — no `Write`, `Edit`, `Skill` or
  `Agent`. Bash is read-only: diff/status/log plus typecheck, test and
  `arch:check` commands.
- **Input:** a plan path; optionally a base ref (default:
  `git merge-base main HEAD`) and the implementer / test-writer reports —
  treated as claims to check, never as evidence.
- **Output:** a report — `Overall: VERIFIED | GAPS | NEEDS_CONTEXT`,
  *Requirements*, *Tasks* and *Acceptance criteria* tables with
  `MET | PARTIAL | NOT MET | UNVERIFIABLE` verdicts and `path:line` or command
  evidence, plus *Scope creep*, *Unverifiable* and *Reports contradicted*.

## doc-writer

- **Responsibility:** turn a shipped feature — a finished plan, a spec draft,
  code, or a short brief — into documentation in the place this repo's docs
  layout expects (`<pkg>/specs/`, `<pkg>/docs/`, a README, or
  `docs/agent-prompts/README.md`), with Mermaid diagrams where they clarify a
  flow, and keep the folder's README index and the owning `<pkg>/CLAUDE.md` ›
  *Read when* discoverable.
- **Permissions:** `Read, Edit, Write, Grep, Glob, Bash, Skill`; `Write`/`Edit`
  limited by rule to the placement table's paths — never `INSIGHTS.md`,
  `docs/plans/**`, the prompt files under `docs/agent-prompts/`, or anything
  under `.claude/**`. Never commits.
- **Skills:** `mermaid-diagram` for every diagram; `engineering-insights` in
  read mode only (INSIGHTS are read for accuracy, never written).
- **Input:** source material (a plan path and/or paths and/or a feature
  description), target package(s), and `Mode: write | outline` (`outline`
  returns the placement decision and a section outline, writes nothing).
- **Output:** the doc placed or updated, plus a report — status
  `DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED`, `Mode`,
  *Placement decisions*, *Files changed*, *Claims verified* (claim →
  `path:line`), *Diagrams*, *Index updates* and *Unresolved*.

## Shared rules

- **One skill map.** Which skill sections apply to which files is defined once,
  in [`pr-self-review/references/routing.md`](../skills/pr-self-review/references/routing.md).
  Planner, implementer and `pr-self-review` all read it, so the plan, the code
  and the review follow the same rules. Change the mapping there, not in the agents.
- **Skills are loaded by explicit `Skill` calls**, not by the `skills:`
  frontmatter field (see sources below).
- **Parallel safety comes from the plan:** tasks in one wave never share a
  file; lockfiles, the DB schema + migration, `coupled-files.md` pairs and
  i18n message files are each owned by one task.
- **One severity scale.** `architecture-reviewer` uses
  [`pr-self-review/references/severity.md`](../skills/pr-self-review/references/severity.md)
  as-is, plus [`reviewer-brief.md`](../skills/pr-self-review/references/reviewer-brief.md)'s
  finding shape (+ `confidence`); no agent defines its own severity scale.
- **Read-only agents are read-only by `tools`, not by `permissionMode`.**
  `architecture-reviewer` and `plan-verifier` get no `Write`/`Edit` in their
  `tools` list, and their allowed Bash commands are a fixed read-only list by
  rule — the same mechanism `researcher` uses. No `permissionMode: plan`, so a
  parent session's own permission mode does not narrow them further.
- Repo-wide rules (Zod 3, do-not-touch paths, English docs, staging by explicit
  path) come from the root `CLAUDE.md` and are not restated in the agents beyond
  what each one must enforce.

## Sources

The rules of all seven agents are based on these (per-agent attribution is in
the Development Plan that introduced each agent, under its *Design* section).
Community sources are marked; where we deliberately deviate, it is noted.

**Claude Code / Anthropic (official)**

- [Create custom subagents](https://code.claude.com/docs/en/sub-agents) —
  frontmatter fields, `description`-driven delegation, least-privilege `tools`,
  nested spawning (hence no `Agent` tool), `isolation: worktree`.
- [Extend Claude with skills](https://code.claude.com/docs/en/skills) — how
  subagents reach skills through the `Skill` tool.
- [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices) —
  explore → plan → code → verify, split between planner and implementer.
- [How and when to use subagents in Claude Code](https://claude.com/blog/subagents-in-claude-code) —
  a few well-scoped agents; parallel edits of one file conflict.
- [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) (2025-06) —
  each subagent gets an objective, output format, tools and boundaries.
- [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) (2024-12) —
  orchestrator-workers (planner/implementer) and evaluator-optimizer with clear
  criteria (architecture-reviewer, plan-verifier judge against a plan's
  acceptance criteria).
- [anthropics/claude-code#67251](https://github.com/anthropics/claude-code/issues/67251) —
  reports that `skills:` frontmatter does not inject skill content; the reason
  every agent calls `Skill` explicitly. Unverified on our installed version.
- [Anthropic `code-review` plugin](https://github.com/anthropics/claude-code/blob/main/plugins/code-review/README.md) —
  confidence 0–100 with a threshold of 80; filter pre-existing and
  lint-catchable issues; file + line evidence (architecture-reviewer).
- [Anthropic `pr-review-toolkit`](https://github.com/anthropics/claude-code/tree/main/plugins/pr-review-toolkit) —
  narrow reviewers; check that the cited guideline says what the finding
  claims (architecture-reviewer).

**Planning methods**

- [GitHub spec-kit](https://github.com/github/spec-kit) and
  [Handling complex features](https://github.github.com/spec-kit/concepts/complex-features.html) —
  contract-first ordering, task IDs `T001`, the `[P]` parallel marker, one task
  per sub-agent with focused context.
- [Kiro specs](https://kiro.dev/docs/specs/) — requirements → design → tasks,
  tasks traced back to requirements, a design section with data flow.
- [Cline Plan & Act](https://docs.cline.bot/core-workflows/plan-and-act) —
  planning is read-only; ask before acting on an ambiguous request.

**obra/superpowers skills (community)**

- [`writing-plans`](https://github.com/obra/superpowers/blob/main/skills/writing-plans/SKILL.md) —
  exact file paths per task, test-first steps, task = smallest unit with its own
  test, plan self-review checklist.
- [`brainstorming`](https://github.com/obra/superpowers/blob/main/skills/brainstorming/SKILL.md) —
  clarify before designing.
- [`subagent-driven-development`](https://github.com/obra/superpowers/blob/main/skills/subagent-driven-development/SKILL.md) —
  one-task brief, status vocabulary `DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED`,
  a review gate after each task; also plan-verifier's source for keeping spec
  compliance separate from quality, and for "cannot verify" resolved by the
  orchestrator, not the sub-agent. **Deviation:** it forbids parallel
  implementers; we run them in parallel on one branch and rely on exclusive
  file ownership instead of worktrees.
- [`subagent-driven-development/task-reviewer-prompt.md`](https://github.com/obra/superpowers/blob/main/skills/subagent-driven-development/task-reviewer-prompt.md) —
  evidence for every finding and every "yes"; "do not trust the report"
  (plan-verifier).
- [`requesting-code-review/code-reviewer.md`](https://github.com/obra/superpowers/blob/main/skills/requesting-code-review/code-reviewer.md) —
  no "looks good" without checking; list what was set aside as outside the
  plan (plan-verifier).
- [`executing-plans`](https://github.com/obra/superpowers/blob/main/skills/executing-plans/SKILL.md) —
  no scope creep; a broken plan is escalated, not patched.
- [`test-driven-development`](https://github.com/obra/superpowers/blob/main/skills/test-driven-development/SKILL.md) —
  red → green → refactor, bounded here by `TESTING.md`; the same skill's raw
  copy, [`test-driven-development/SKILL.md`](https://raw.githubusercontent.com/obra/superpowers/main/skills/test-driven-development/SKILL.md),
  is test-writer's source for "fail first, for the expected reason".
- [`test-driven-development/writing-good-tests.md`](https://raw.githubusercontent.com/obra/superpowers/main/skills/test-driven-development/writing-good-tests.md) —
  Mutation Check; "the mock earns no assertions"; mock at the right level; no
  change detectors; no test-only methods (test-writer).
- [`verification-before-completion`](https://github.com/obra/superpowers/blob/main/skills/verification-before-completion/SKILL.md) —
  no completion claim without a fresh command run; also plan-verifier's source
  for fresh command evidence.

**Role-specialised agent collections (community)**

- [wshobson/agents](https://github.com/wshobson/agents),
  [VoltAgent/awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents) —
  separate backend and frontend developer agents. **Deviation:** one
  implementer with two mandatory skill sets; also wshobson/agents' source for
  architecture review as its own narrow read-only agent (architecture-reviewer).
- [wshobson `test-automator`](https://github.com/wshobson/agents/blob/main/plugins/codebase-cleanup/agents/test-automator.md) —
  red-green-refactor with a verified failure (test-writer).
- [VoltAgent `test-automator`](https://github.com/VoltAgent/awesome-claude-code-subagents/blob/main/categories/04-quality-security/test-automator.md) —
  report shape only. **Deviation:** its coverage-% gates are rejected — they do
  not prevent tautological tests (test-writer).
- [VoltAgent `architect-reviewer`](https://github.com/VoltAgent/awesome-claude-code-subagents/blob/main/categories/04-quality-security/architect-reviewer.md) —
  counter-example: has `Write`/`Edit`/`Bash` and a generic checklist.
  **Deviation:** architecture-reviewer copies neither — no write access, no
  generic checklist, only routing.md rows.
- [wshobson documentation-generation agents](https://github.com/wshobson/agents/tree/main/plugins/documentation-generation/agents) —
  `docs-architect` (examples from the real codebase, cite `file_path:line`),
  `mermaid-expert` (right diagram type, no overcrowding, validate syntax),
  `api-documenter` (authoritative source first) (doc-writer).
- [VoltAgent `documentation-engineer`](https://github.com/VoltAgent/awesome-claude-code-subagents/blob/main/categories/06-developer-experience/documentation-engineer.md) —
  evaluate gaps first, update vs create, cross-reference, no duplication
  (doc-writer).
- [VoltAgent `technical-writer`](https://github.com/VoltAgent/awesome-claude-code-subagents/blob/main/categories/08-business-product/technical-writer.md) —
  verify accuracy, broken-link checks (doc-writer).

**Testing (test-writer)**

- [Testing implementation details](https://kentcdodds.com/blog/testing-implementation-details) (2020-08-17) and
  [Testing Library guiding principles](https://testing-library.com/docs/guiding-principles/) —
  assert what users observe, not internals.
- [The Testing Trophy](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications) (2021-06-03) —
  mostly integration tests.
- [Effective snapshot testing](https://kentcdodds.com/blog/effective-snapshot-testing) (2017) —
  small, targeted snapshots only, never a default.
- [Vitest mocking](https://vitest.dev/guide/mocking.html) — `vi.mock` hoisting,
  restoring mocks between tests, fake timers.

**Architecture review (architecture-reviewer)**

- [dependency-cruiser rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) —
  forbidden / reachable rules; the tool's own output is ground truth, cited by
  rule name, never re-derived.
- References read, not adopted: [ArchUnitTS](https://github.com/LukasNiessen/ArchUnitTS),
  [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries),
  [Nx module boundaries](https://nx.dev/docs/features/enforce-module-boundaries).

**Plan verification (plan-verifier)**

- [spec-kit agentic SDD reference](https://github.github.io/spec-kit/reference/agentic-sdd.html)
  (`/speckit.analyze`, `/speckit.checklist`) — read-only cross-artifact check:
  requirement without a task, task without a requirement.
- [LLM-as-judge biases](https://ai-tldr.dev/learn/evaluation-safety/llm-as-judge/llm-judge-biases/) (secondary, 2026) and
  [Rubber-stamp reviews](https://www.minware.com/guide/anti-patterns/rubber-stamp-reviews) (secondary) —
  checklist, one item at a time, evidence per claim. **Note:** the verdict
  vocabulary (`MET | PARTIAL | NOT MET | UNVERIFIABLE` /
  `VERIFIED | GAPS | NEEDS_CONTEXT`) is this repo's own — no external
  convention was found for it.

**Documentation (doc-writer)**

- [Diátaxis](https://diataxis.fr/) — tutorial / how-to / reference / explanation.
- [Google developer documentation style highlights](https://developers.google.com/style/highlights) —
  second person, active voice, sentence-case headings, numbered steps.
- [arc42](https://arc42.org/overview/) and [C4 model](https://c4model.com/) —
  architecture doc sections, diagram levels (context/container/component).
- [Docs as code](https://www.writethedocs.org/guide/docs-as-code/) (Write the Docs).
