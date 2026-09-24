# Subagents

Project subagents for DevDigest. This file is the map of the set: who does what,
with which rights, what goes in and what comes out, and where the rules come
from. The agent files themselves hold the procedures and report templates; read
those for detail, and do not copy them here.

Each file's frontmatter is its whole permission model; the body is its system
prompt. A session that started before this folder existed does not see it at all
(`Agent type '…' not found`) — restart, or check from a fresh `claude -p` session.

## At a glance

| Agent | Responsibility | Not its job | Model |
|---|---|---|---|
| [`researcher`](researcher.md) | Answers **one concrete question** with evidence — from the repo (code, config, docs, git history), external sources, or both | Changing anything; many-source narrative reports (`/deep-research`) | `sonnet` |
| [`planner`](planner.md) | Turns a request into a **Development Plan**: what already exists, work packages per file, the skills that bind each one, gates, acceptance criteria, test plan | Writing code, web research, review steps | `opus`, `effort: high` |
| [`implementer`](implementer.md) | Executes an **approved** plan in `server/`, `client/` (and `reviewer-core/` when the plan says so), runs the existing checks, compares its diff to the plan, hands the tests to test-writer | **Writing tests**, planning, architecture/security review, `/pr-self-review`, commits, pushes, PRs, writing `INSIGHTS.md` | `sonnet` |
| [`test-writer`](test-writer.md) | Writes **all** tests — server, client, reviewer-core, e2e flows on request — with assertions taken from the plan or spec, and proves each new test fails without its behaviour (**red-proof** in a throwaway worktree) | Production code, configs, dependencies, weakening a red test | `sonnet`, `effort: high` |
| [`plan-verifier`](plan-verifier.md) | Grades **every item** of a plan — goal, non-goals, contract, decisions, gates, each work package, acceptance criteria, test plan, docs — PASS / FAIL / UNVERIFIABLE in a traceability matrix, with its own code and test evidence | Advice, code review, an overall score | `opus`, `effort: high` |
| [`architecture-reviewer`](architecture-reviewer.md) | Checks the change against the written **architectural boundaries** (onion layering, client placement and imports, vendored twins, reviewer-core purity): rule → `file:line` → quoted evidence → severity, each finding re-verified | Security, style, tests, fixing code, the pre-push gate | `opus`, `effort: high` |
| [`doc-writer`](doc-writer.md) | Documents **implemented** behaviour from a plan, report, diff or notes, verified against the code, with Mermaid diagrams, placed by the repo's taxonomy (`<pkg>/docs/`, ADRs, `docs/`, README, `TESTING.md`) | Code, `INSIGHTS.md`, specs and `AGENTS.md` without approval, documenting plans as if built | `sonnet`, `effort: medium` |

## Permissions

| | researcher | planner | implementer | test-writer | plan-verifier | architecture-reviewer | doc-writer |
|---|---|---|---|---|---|---|---|
| `tools` | Read, Grep, Glob, Bash, WebSearch, WebFetch | Read, Grep, Glob, Bash | Read, Grep, Glob, Bash, Edit, Write, Skill, TodoWrite | Read, Grep, Glob, Bash, Edit, Write, TodoWrite | Read, Grep, Glob, Bash | Read, Grep, Glob, Bash | Read, Grep, Glob, Bash, Edit, Write, TodoWrite |
| `disallowedTools` | Write, Edit, NotebookEdit, Skill | Write, Edit, NotebookEdit, Skill, WebFetch, WebSearch, Agent, ExitPlanMode | Agent, WebFetch, WebSearch, NotebookEdit | Agent, Skill, WebFetch, WebSearch, NotebookEdit | Write, Edit, NotebookEdit, Skill, WebFetch, WebSearch, Agent, ExitPlanMode | same as plan-verifier | Agent, Skill, WebFetch, WebSearch, NotebookEdit |
| `permissionMode` | inherited | `default` ⚠ | `acceptEdits` | `acceptEdits` | `default` | `default` | `acceptEdits` |
| Writes files? | no | no | yes, guarded — no tests | test files only, guarded | no | no | markdown docs only, guarded |
| Bash | inspection only — by prompt | inspection only — by prompt, **guarded read-only** | anything except what the guard denies | + shell writes inside the red-proof worktree | inspection + test commands, **guarded read-only** | inspection, **guarded read-only** | inspection, no shell writes |
| Hook | — | `agent-scope-guard.sh` `read-only` | [`implementer-guard.sh`](../hooks/implementer-guard.sh) | [`agent-scope-guard.sh`](../hooks/agent-scope-guard.sh) `test-writer` | `agent-scope-guard.sh` `read-only` | `agent-scope-guard.sh` `read-only` | `agent-scope-guard.sh` `doc-writer` |

Read-only for researcher is **two layers**: no write tools in frontmatter, and
a prompt rule against writing through Bash. planner, plan-verifier and
architecture-reviewer get a **third** layer — they need Bash for real work
(`git log --all`, `git grep` at two revisions, running the test plan): the
`read-only` guard profile, which denies redirects, `rm`/`mv`/`cp`/`tee`/`sed -i`, installs and git
state changes. A subagent's Bash cannot be narrowed by `disallowedTools` — a
command-specific entry there removes the whole tool — so a hook is the only
per-command control ([subagent docs](https://code.claude.com/docs/en/sub-agents)).

⚠ **`permissionMode: plan` overrides `model: opus`.** Measured 2026-09-24 on
2.1.281: two otherwise identical subagents with `model: opus` ran on
`claude-sonnet-5` under `plan` and on `claude-opus-5-5` under `default`; the
`planner` ran on `claude-sonnet-5` while it had `plan`. So no agent here uses
plan mode: the read-only ones use `default` and rely on their tools and the
guard (planner switched on the user's decision, 2026-09-24).

No agent uses the `skills:` frontmatter or `memory:`. `skills:` is documented to
inject the full skill, but [anthropics/claude-code#67251](https://github.com/anthropics/claude-code/issues/67251)
reports only the name arrives; the four newer agents instead **Read** the
`SKILL.md` sections they need by path, as `pr-self-review` does, and have
`Skill` disallowed so they cannot start a process skill with side effects
(`pr-self-review` writes `.git/devdigest/`, `engineering-insights` writes
`INSIGHTS.md`). `memory:` would silently re-enable Read/Write/Edit.

## Inputs and outputs

| Agent | Input (the delegation prompt) | Output (its final message) | Stops early with |
|---|---|---|---|
| researcher | A question with scope and an expected answer shape (yes/no, location, list, comparison) | **Repo research** or **External research** report: answer + confidence, findings with `path:line` / URL evidence, inferences, a **Not found** table, open questions | `NEEDS CLARIFICATION` — up to 5 questions and a default assumption |
| planner | A feature request or change with an outcome and a scope; optionally a researcher report | **Development Plan**: goal, non-goals, what already exists, contract, decisions, **Gates**, work packages (files · skills by § · constraints · steps · done when · tests as Given/When/Then for test-writer), order, acceptance criteria, test plan, docs to update, risks | `NEEDS CLARIFICATION` |
| implementer | The Development Plan **verbatim**, plus which Gates the user approved | **Implementation Report**: status, changes per work package, deviations, verification table with exit codes, acceptance criteria, **Handoff to test-writer** (plan test items + intended breaks), out-of-scope observations, **Insight candidates**. Code change left **uncommitted** | `BLOCKED` report — no plan, unapproved gate, a plan that breaks a rule |
| test-writer | The plan (or the WP ids / Test plan rows to cover) + the implementer's handoff; or a target behaviour and its source of truth | **Test Report**: tests with their oracle source, verification (3 runs per new file), **Red-proof** table, suspected defects (left red), not covered, insight candidates. Test files left **uncommitted** | `NEEDS CLARIFICATION` (no behaviour or no source of truth); `blocked` (needs a dependency, config or production change) |
| plan-verifier | The plan **verbatim** + approved Gates; optionally the implementation and test reports and the files modified before work started | **Plan Verification**: `PASS / FAIL / INCOMPLETE`, a traceability matrix (ID · requirement verbatim · code evidence · test evidence · verdict), failures with "to pass", unverifiable items, scope, commands run | `NEEDS CLARIFICATION` (no plan); `BLOCKED` (no change) |
| architecture-reviewer | Nothing, a commit range, or paths; optionally the plan | **Architecture Review**: verdict, scope by group, deterministic checks (greps, twin, registration, reviewer-core purity), findings `AR-n` with rule · location · evidence · mechanism, dropped candidates, not checked | `NEEDS CLARIFICATION` (nothing to review) |
| doc-writer | Material (plan, reports, diff, notes) + what to document; optionally a target file | **Documentation Report**: files with Diátaxis type, diagrams, claims verified (`path:line`), discrepancies, text **needing approval**, INSIGHTS promotion candidates. Docs left **uncommitted** | `NEEDS CLARIFICATION` (no material, or the feature is not built) |

## The flow

```
question ─► researcher ─► report ────────────────────┐   (optional, any stage)
request  ─► planner ─► Development Plan ─► user approves (plan + Gates)
         ─► implementer (plan verbatim) ─► Implementation Report + uncommitted code
         ─► test-writer (plan + handoff) ─► Test Report + uncommitted tests
         ─► plan-verifier ∥ architecture-reviewer (both read-only, on the uncommitted change)
              FAIL / findings ─► implementer (code) or test-writer (tests) ─► verify again
         ─► doc-writer (plan + reports) ─► docs
         ─► main session: INSIGHTS.md from every report's "Insight candidates"
         ─► commit ─► /pr-self-review ─► push
```

Subagents cannot ask the user anything (`AskUserQuestion` is never given to a
subagent), so each one returns a `NEEDS CLARIFICATION` or `BLOCKED` block
instead, and the main session relays it. Subagents do not see the conversation
either: the plan reaches each agent only through the delegation prompt, so pass
it **verbatim**, together with which Gates the user approved.

**Why tests are a separate agent.** A model that writes the code and its tests
tends to shape the expected values to whatever the code returns — up to 68% of
suites from coverage-driven LLM test generators "validate bugs" instead of
catching them ([arXiv 2412.14137](https://arxiv.org/abs/2412.14137)); Meta's
TestGen-LLM keeps a generated test only when it builds, passes reliably and
adds coverage ([arXiv 2402.09171](https://arxiv.org/abs/2402.09171)). So
test-writer takes its oracles from the plan, and must show each test going red
without the behaviour. Mutation testing (Stryker) would be stronger, but it is
a new dependency; the red-proof worktree needs none.

**architecture-reviewer vs `/pr-self-review`.** Same rules, different stage.
The reviewer runs before the commit, on the working tree, on boundaries only
(groups A and C plus reviewer-core and the vendored twins), and writes nothing.
`/pr-self-review` runs on the committed branch, covers every group including
security, and writes the report the push gate reads. The reviewer reuses the
gate's `routing.md`, `greps.md` and `reviewer-prompt.md` by reference, so both
calibrate the same way; a clean architecture review does not replace the gate.

**plan-verifier vs the implementer's own check.** The implementer's "check the
diff against the plan" is a self-assessment and its report is a claim;
plan-verifier re-derives every verdict from the code and from commands it runs
itself, on a different model. Per-item binary grading is used instead of a
holistic score because it agrees with human judgement markedly better
(CheckEval, [arXiv 2403.18771](https://arxiv.org/abs/2403.18771); TICK,
[arXiv 2410.03608](https://arxiv.org/abs/2410.03608); Anthropic,
[develop tests](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests)).

## Where the rules come from

Most of the rules in these agents are not new policy. They restate
project rules, recorded traps and skills so a subagent cannot miss them. When a
source changes, the agent that restates it is now stale — this table says which.

### planner

| Rule in [`planner.md`](planner.md) | Source |
|---|---|
| Step 0: return questions instead of guessing | Subagents have no `AskUserQuestion` — [subagent docs](https://code.claude.com/docs/en/sub-agents) |
| Step 1: read `<pkg>/AGENTS.md` + `INSIGHTS.md`, find or update the spec, note docs to change | Root [`AGENTS.md`](../../AGENTS.md) § Workflow 1, 2, 4; `<pkg>/specs/_template.md`; test plan from [`TESTING.md`](../../TESTING.md) |
| Step 2: search what already exists, including `git log --all` | Root [`INSIGHTS.md`](../../INSIGHTS.md) 2026-09-23 (reverted lesson work reachable only via `--all`) |
| Step 2: a Zod contract does not prove a route serves it | Root `INSIGHTS.md` 2026-09-19 (contracts with no server implementation) |
| Step 3: map every file to routing groups A–F and cite skill rules by § | [`pr-self-review/routing.md`](../skills/pr-self-review/routing.md) § Groups — the same table the pre-PR review uses; the §s are in each `../skills/<name>/SKILL.md` |
| Step 3: new module = `src/modules/<name>/` + registration; external calls via adapters + `mocks.ts`; `.it.test.ts` suffix | [`server/AGENTS.md`](../../server/AGENTS.md) § Must not break |
| Step 3: known onion exceptions (`pulls`, `polling`, `settings`, `workspace`) are not fixed in passing | [`onion-architecture`](../skills/onion-architecture/SKILL.md) §11 |
| Step 3: client data only via `lib/hooks/*` → `lib/api.ts`; UI strings in `messages/<locale>/` | [`client/AGENTS.md`](../../client/AGENTS.md); [`frontend-ui-architecture`](../skills/frontend-ui-architecture/SKILL.md) |
| Step 3: contracts change in both vendored copies; a reviewer-core change needs server checks | Root `AGENTS.md` § Cross-package invariants |
| Step 4 Gates: schema, migrations, lock files, dependencies | Root `AGENTS.md` § Do not touch; migrations are hand-written per [`docs/hand-written-migrations.md`](../../docs/hand-written-migrations.md) |
| Step 4 Gates: `package.json` changes | Root `AGENTS.md` § Lock files; `server/AGENTS.md` (`package.json` is skip-worktree) |
| Step 5: plan only what the implementer may do | [`implementer.md`](implementer.md) hard rules — the two files are coupled |
| Step 5: tests are test-writer's brief, written as Given/When/Then; no test file in a WP's Files | [`test-writer.md`](test-writer.md) Step 2 (oracles before the code); user decision 2026-09-24 to take tests away from the implementer |
| Step 5: every AC / Done when / Non-goal observable | [`plan-verifier.md`](plan-verifier.md) rule 4 — a vague item is graded UNVERIFIABLE; Given/When/Then per [Agile Alliance](https://agilealliance.org/glossary/given-when-then/) |

### implementer

| Rule in [`implementer.md`](implementer.md) | Source |
|---|---|
| Never touch migrations, lock files, dependencies; only `--frozen-lockfile` / `npm ci` | Root [`AGENTS.md`](../../AGENTS.md) § Do not touch |
| Never create `CLAUDE.md` / `CLAUDE.local.md` | Root [`INSIGHTS.md`](../../INSIGHTS.md) 2026-09-20 (one such file silently drops every `AGENTS.md`) |
| A guard denial is final; the guard decides `ask` when it cannot parse input | [`implementer-guard.sh`](../hooks/implementer-guard.sh); root `INSIGHTS.md` 2026-09-21 (a hook that errors fails **open**) |
| Load skills per file, following `routing.md` over its own table | [`pr-self-review/routing.md`](../skills/pr-self-review/routing.md) § Groups — so implementation and pre-PR review apply the same rules |
| Spec first; update listed docs in the same change | Root `AGENTS.md` § Workflow 2, 4 |
| Contracts in both copies, checked with `diff -r` | Root `AGENTS.md` § Cross-package invariants; `routing.md` § Vendored-contract twin check |
| No tests — hand them to test-writer, including intended breaks; `mocks.ts` stays the implementer's | User decision 2026-09-24; [arXiv 2412.14137](https://arxiv.org/abs/2412.14137) (one model writing both validates its own bugs); enforced by `implementer-guard.sh` |
| Step 3 verification commands per package | `server/AGENTS.md` § Commands, `client/AGENTS.md`, `reviewer-core/AGENTS.md`, `TESTING.md` |
| A green `.it.test` run without Docker is "skipped", not "passed" | `TESTING.md` § server-integration (the tests self-skip) |
| Check `command -v agent-browser` before trusting an e2e run | [`e2e/INSIGHTS.md`](../../e2e/INSIGHTS.md) 2026-09-19 (the script exits 0 with 0 flows run) |
| reviewer-core change ⇒ run server checks too | Root `AGENTS.md` § Cross-package invariants |
| No `INSIGHTS.md` writes — report "Insight candidates" | Root `AGENTS.md` § Workflow 3: `engineering-insights` runs in the main session |
| No review, no `/pr-self-review` | [`docs/pr-self-review.md`](../../docs/pr-self-review.md) — review is a separate stage on the committed diff |

### test-writer

| Rule in [`test-writer.md`](test-writer.md) | Source |
|---|---|
| Test files only; a red test stays red and is reported | [pyor.review](https://pyor.review/blog/test-rewrite-failure-mode) (an agent blocked by a test rewrote the check to return true — practitioner report); `agent-scope-guard.sh` `test-writer` |
| `fireEvent` + `vi.mock`, no `user-event`, no MSW — overriding the RTL skill | [`client/INSIGHTS.md`](../../client/INSIGHTS.md) 2026-09-23 (not installed; lock files off-limits) |
| Oracles from the requirement, before reading the implementation | [arXiv 2412.14137](https://arxiv.org/abs/2412.14137) (oracles "designed to pass" validate bugs) |
| Skills per code under test, read by § | [`routing.md`](../skills/pr-self-review/routing.md) § Groups; [`onion-architecture`](../skills/onion-architecture/SKILL.md) §9; [`react-testing-library`](../skills/react-testing-library/SKILL.md) § Query Priority ([testing-library.com](https://testing-library.com/docs/queries/about/)); `fastify-best-practices/rules/testing.md` ([`app.inject`](https://fastify.dev/docs/latest/Guides/Testing/)) |
| Placement, `.it.test.ts`, typological coverage, hermetic mocks | [`TESTING.md`](../../TESTING.md) § Philosophy, § Conventions; `onion-architecture` §9 |
| Defect list: over-mocking, tautology, weak assertions, flake | the course author's reverted `test-quality-reviewer.md` (`git show 98eaf57:docs/agent-prompts/test-quality-reviewer.md`); [Kent C. Dodds](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library) |
| Client import traps (`@/`, depth to `messages/`) | [`greps.md`](../skills/pr-self-review/greps.md) (new deep relatives came from new tests); `client/INSIGHTS.md` 2026-09-22 |
| Three runs per new file; red-proof per test | [Meta TestGen-LLM](https://arxiv.org/abs/2402.09171) (keep only tests that pass reliably); mutation testing without Stryker (new dependency, root `AGENTS.md`) |
| Execute every new e2e flow; `click` takes a selector | [`e2e/INSIGHTS.md`](../../e2e/INSIGHTS.md) 2026-09-22 |

### plan-verifier

| Rule in [`plan-verifier.md`](plan-verifier.md) | Source |
|---|---|
| Every item gets its own PASS / FAIL / UNVERIFIABLE; no score, no advice | CheckEval [arXiv 2403.18771](https://arxiv.org/abs/2403.18771), TICK [arXiv 2410.03608](https://arxiv.org/abs/2410.03608), [Anthropic develop tests](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests), [OpenAI graders](https://developers.openai.com/api/docs/guides/graders) |
| Requirement → code evidence → test evidence | Requirements traceability matrix ([Jama](https://www.jamasoftware.com/requirements-management-guide/requirements-traceability/traceability-matrix/)) |
| Vague item ⇒ UNVERIFIABLE; restate as Given/When/Then | "Verifiable requirement", ISO/IEC/IEEE 29148 (paywalled — via secondary sources); [Agile Alliance](https://agilealliance.org/glossary/given-when-then/) |
| Item IDs follow the plan's sections | [`planner.md`](planner.md) § Output format — the two files are coupled |
| `.it.test` without Docker is UNVERIFIABLE; e2e needs `agent-browser` | `TESTING.md` § server-integration; `e2e/INSIGHTS.md` 2026-09-19 |

### architecture-reviewer

| Rule in [`architecture-reviewer.md`](architecture-reviewer.md) | Source |
|---|---|
| Finding = rule → `file:line` → quoted line → severity | [dependency-cruiser rules](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) (rule, severity, location); [fitness functions](https://www.oreilly.com/library/view/building-evolutionary-architectures/9781491986356/ch02.html) |
| Re-verify each finding; drop the unconfirmed | LLM reviewers hallucinate findings ([HalluJudge, arXiv 2601.19072](https://arxiv.org/html/2601.19072), preprint) |
| Severity, CRITICAL bar, grandfathering, verdict | [`reviewer-prompt.md`](../skills/pr-self-review/reviewer-prompt.md) — borrowed, not reworded |
| Grep checks by subtraction, severity ceiling | [`greps.md`](../skills/pr-self-review/greps.md) |
| Groups A and C only; twin check | [`routing.md`](../skills/pr-self-review/routing.md) |
| Server rules §1–12, §11 exceptions | [`onion-architecture`](../skills/onion-architecture/SKILL.md) |
| Client rules §1–12 | [`frontend-ui-architecture`](../skills/frontend-ui-architecture/SKILL.md) |
| reviewer-core purity grep (new, 0 hits at `438513f`) | [`reviewer-core/AGENTS.md`](../../reviewer-core/AGENTS.md) § Must not break — no skill covered it |

### doc-writer

| Rule in [`doc-writer.md`](doc-writer.md) | Source |
|---|---|
| Document the code, present tense, no pre-announcing | [Google style highlights](https://developers.google.com/style/highlights); root `AGENTS.md` § Workflow 4 |
| One page, one purpose | [Diátaxis](https://diataxis.fr/) |
| Link, do not duplicate; README short, depth in `<pkg>/docs/` | `<pkg>/docs/README.md`; the course author's reverted `docs/README.md` (`git show 84e2c1e:docs/README.md`: "do not restate README.md, link to it"; intent → `specs/`) |
| ADRs in `<pkg>/docs/adr/NNNN-<title>.md` | `<pkg>/docs/README.md`; [Nygard](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions.html), [adr.github.io](https://adr.github.io/) |
| Intent goes to specs, not docs; one spec per cross-package feature | `<pkg>/specs/README.md` |
| INSIGHTS.md read-only, settled entries proposed for promotion | Root [`INSIGHTS.md`](../../INSIGHTS.md) header ("settled knowledge moves to docs/"); `engineering-insights` |
| Mermaid in markdown, type by content, one C4 level | [`mermaid-diagram`](../skills/mermaid-diagram/SKILL.md); [GitHub renders Mermaid](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams); [C4](https://c4model.com/) |

### External sources for the set as a whole

The design follows the official
[subagent docs](https://code.claude.com/docs/en/sub-agents) (focused agents,
least-privilege `tools`, descriptions that single out one agent, `permissionMode`
precedence, frontmatter hooks), the
[skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
(third-person what + when descriptions, template outputs, feedback loops), and
Anthropic's [multi-agent guidance](https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them)
(verifiers that report every failure). That same post warns that splitting one
feature into planner → implementer phases costs coordination tokens; the split
is kept here because the plan is a human-approved gate, handed over once.

## The guards

Six of the seven agents declare a `PreToolUse` hook in their frontmatter:

- `implementer` → [`../hooks/implementer-guard.sh`](../hooks/implementer-guard.sh)
  turns the "do not touch" rules of the root `AGENTS.md` into denials, denies
  test files (test-writer owns them), and asks the user before a
  `server/src/db/schema*` or `package.json` edit.
- `planner`, `test-writer`, `doc-writer`, `plan-verifier`, `architecture-reviewer` →
  [`../hooks/agent-scope-guard.sh`](../hooks/agent-scope-guard.sh) with a
  profile argument (`test-writer`, `doc-writer`, `read-only`): the same deny
  core plus an allowlist of what that agent may write.

Decision tables and tests: [`../hooks/README.md`](../hooks/README.md).

**They only run in a trusted workspace.** Claude Code skips a project agent's
frontmatter hooks until the folder is trusted, and a `claude -p` session never
counts as trusted — there these agents run **unguarded**, with only their
prompts. Accept the workspace trust dialog before relying on them, and do not
run the writing agents from `-p` scripts. (Definitions passed with `--agents`
do run their hooks; that is how the guards are verified end to end.)

## Changing an agent

- **Change together:**
  - `planner.md` Step 5 ↔ `implementer.md` hard rules ↔ `test-writer.md`
    (who writes tests, and the shape of a WP's Tests line);
  - `planner.md` § Output format ↔ `plan-verifier.md` Step 1 (item IDs per
    plan section);
  - `implementer.md` report ↔ `test-writer.md` input ("Handoff to
    test-writer") ↔ `plan-verifier.md` rule 2;
  - `implementer.md` skill table, `test-writer.md` Step 1 and
    `architecture-reviewer.md` Step 2 ↔ `routing.md`; `architecture-reviewer.md`
    ↔ `greps.md` and `reviewer-prompt.md`;
  - `implementer.md` rules 2 and 5 ↔ `implementer-guard.sh`; each new agent's
    hard rules ↔ its `agent-scope-guard.sh` profile; both guards' deny core
    ↔ root `AGENTS.md` § Do not touch;
  - `test-writer.md` rule 3 ↔ `client/INSIGHTS.md` 2026-09-23 (remove the
    override if `user-event` / `msw` are ever installed).
- **Check that it loaded — from a fresh session.** No `claude` is on `PATH` in a
  VSCode-extension session, but `$CLAUDE_CODE_EXECPATH` points at the
  extension's native binary, so a fresh headless session is
  `"$CLAUDE_CODE_EXECPATH" -p '…' --output-format stream-json --verbose`. It
  inherits `.claude/settings.json`, but is never a trusted workspace (so no
  frontmatter hooks — see [the guards](#the-guards)).
  - **Loaded?** The `system/init` event's `agents` array lists every definition
    that parsed. `"$CLAUDE_CODE_EXECPATH" agents --json` does **not** help: it
    lists running sessions, not definitions.
  - **Right model?** Assistant events whose `parent_tool_use_id` is the
    subagent's `Agent` call carry `message.model`. A subagent that answers in
    one turn without a tool call (a `NEEDS CLARIFICATION` probe) emits **no**
    such event — read `message.model` from the transcript named by the
    `system/task_notification` event's `output_file`. Do check it: this is how
    `permissionMode: plan` was caught replacing `model: opus` with
    `claude-sonnet-5` (planner ran on Sonnet until it moved to `default` + the
    read-only guard; it now runs on `claude-opus-5-5`, 2026-09-24, 2.1.281).
  - Never report such a check as done when it could not run.
