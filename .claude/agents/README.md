# Project agents — map

Index of the subagents for DevDigest. This is a map, not a copy: the full behavior lives in each agent's own file.

## Status

| Agent | File | Status |
|---|---|---|
| `researcher` | `researcher.md` | **Exists** |
| `planner` | `planner.md` | **Exists** |
| `implementer` | `implementer.md` | **Exists** |
| `test-writer` | `test-writer.md` | **Exists** (needs restart) |
| `architecture-reviewer` | `architecture-reviewer.md` | **Exists** (needs restart) |
| `plan-verifier` | `plan-verifier.md` | **Exists** (needs restart) |
| `doc-writer` | `doc-writer.md` | **Exists** (needs restart) |

New files in this directory are picked up after Claude Code is restarted.

## Workflow

```
question ──► researcher ──► report (facts, evidence, gaps)
                                   │
task ──► planner ──► Development Plan ──► implementer ──► Implementation report
                                                               │
                         ┌─────────────────────────────────────┼──────────────────────┐
                         ▼                                     ▼                      ▼
                    test-writer                    architecture-reviewer        plan-verifier
                    (Test report)                  (findings with evidence)     (per-item verdicts)
                                                                                      │
                                                                                      ▼
                                                                                 doc-writer ──► docs/, <pkg>/docs/, specs/
```

Security review is still separate (`security-review` skill), not an agent here.

Only the main agent delegates. No agent below has the `Agent` tool, so none of them spawns further subagents.

## Agents

| | `researcher` | `planner` | `implementer` |
|---|---|---|---|
| **Responsibility** | Answers a concrete question from the repo or external sources. Changes nothing. | Turns a task into a structured Development Plan that respects modules, skills, `INSIGHTS.md` and architecture rules. Changes nothing. | Executes a plan in frontend and backend, applies matching project skills, runs existing tests, checks its own changes only. |
| **Model** | `sonnet` | `opus` | `sonnet` |
| **Tools** | `Read, Grep, Glob, Bash, WebFetch, WebSearch` | `Read, Grep, Glob, Bash, Skill` | `Read, Grep, Glob, Edit, Write, Bash, Skill` |
| **No `Write`/`Edit`** | yes | yes | no |
| **Bash use** | read-only (`git log`, `rg`, `ls`) | read-only | tests, typecheck, lint |
| **Preloaded skills** | none | the same 12 as `implementer` (list in `skill-routing.md`) | the same 12 as `planner`: onion-architecture, fastify-best-practices, drizzle-orm-patterns, postgresql-table-design, zod, frontend-ui-architecture, next-best-practices, react-best-practices, react-testing-library, typescript-expert, security, engineering-insights |
| **Input** | A concrete question, plus scope (repo / external / both). If missing, it asks 1–4 clarifying questions first. | A task or goal. If unclear, it asks clarifying questions first. | The full Development Plan in the delegation prompt (it has no conversation history). Asks if the plan is missing or ambiguous. |
| **Output** | Report A (repository) and/or Report B (external): conclusions, evidence, discrepancies, links, **could not find**. | Development Plan as text: problem, scope, constraints, contract changes, steps with skills, test plan, risks, acceptance criteria, handoff. | Implementation report: step status, verification table (baseline vs after), deviations, skills applied, not verified, insight candidates. |

## Review, test and docs agents

| | `test-writer` | `architecture-reviewer` | `plan-verifier` | `doc-writer` |
|---|---|---|---|---|
| **Responsibility** | Writes UI (RTL) and backend (Fastify `inject`, hermetic and `*.it.test.ts`) tests. Never edits source. | Checks architectural boundaries in a diff; returns findings with quoted evidence. Changes nothing. | Checks finished code against every plan and requirement item; runs the real typecheck and tests. Changes nothing. | Documents implemented features and turns plans into docs with Mermaid diagrams, in the right `docs/` section. |
| **Model** | `sonnet` | `opus` | `sonnet` | `sonnet` |
| **Tools** | `Read, Grep, Glob, Edit, Write, Bash, Skill` | `Read, Grep, Glob` | `Read, Grep, Glob, Bash` | `Read, Grep, Glob, Edit, Write, Bash, Skill` |
| **Preloaded skills** | react-testing-library, fastify-best-practices, onion-architecture, zod, typescript-expert, engineering-insights | onion-architecture, frontend-ui-architecture, zod, engineering-insights | engineering-insights | mermaid-diagram, engineering-insights |
| **Enforcement** | `permissionMode` unset; hook `agent-guard.sh test-writer`: writes only to test files, Bash cannot commit, migrate or redirect | `permissionMode: plan`, no Bash, no Write/Edit | hook `agent-guard.sh plan-verifier`: Bash allowlist (git read, `rg`, `ls`, `wc`, typecheck/test, `scripts/check-all.sh`) | hook `agent-guard.sh doc-writer`: writes only under `docs/`, `<pkg>/docs/`, `specs/`, `<pkg>/specs/`; never `INSIGHTS.md`; read-only Bash |
| **maxTurns** | 40 | 25 | 40 | 30 |
| **Input** | What to test (plan, diff or paths) | Diff or file list plus packages | Full plan, requirements, diff or paths | What to document plus the source (plan, spec, code) |
| **Output** | Test report: tests written, baseline vs after, suspected source bugs, source changes needed | Architecture review: findings table, rules checked, could not verify | Plan verification: `N items in, N rows out`, verdicts MET / PARTIAL / NOT MET / UNVERIFIABLE with evidence | Docs report: files, Diátaxis type, planned vs implemented, diagrams, `TODO: unverified` |

These four also have no `Agent` tool. Their skill lists are narrower than the `planner`/`implementer` set on purpose: `skills:` preloads full content into context.

The hooks live in `.claude/hooks/agent-guard.sh` and are attached inline in each agent's frontmatter, so they apply only while that agent runs. They are a best-effort guard, not a sandbox: a `tools` allowlist does not stop Bash from writing, so the script blocks git history changes, migrations, `docker compose down`, file-mutating commands and redirects. Hook behavior inside subagents has been tested against synthetic hook input only; confirm it after a restart (see below).

Explicit non-goals:

- `researcher` does not use `/deep-research`, does not write to `INSIGHTS.md`, and does not run anything that changes state.
- `planner` writes no files. Saving the plan (for example under `specs/`) is the main agent's call.
- `implementer` does no architecture or security review; `architecture-reviewer` covers architecture, security review stays separate. It also never runs `git add/commit/push`, `db:generate`/`db:migrate` (unless the plan says so), or `docker compose down -v`.
- `test-writer` does not change source: a bug found by a test is reported, not fixed. `architecture-reviewer` does no security, style or performance review. `plan-verifier` never fixes code and does not accept the implementer's summary as evidence. `doc-writer` does not write `INSIGHTS.md` or source, and creates no `docs/adr/` or `docs/diagrams/` (diagrams are inline).

## Shared inputs for `planner` and `implementer`

- Read order: `<module>/specs/` → `docs/` → `INSIGHTS.md` → source (from the root `CLAUDE.md`).
- Skill routing (which skill applies to which path or change type, plus per-package commands and known traps): `.claude/references/skill-routing.md`. One shared file, so the plan cannot promise skills the implementer will not apply. Both agents keep identical `skills:` lists for frontend and backend; a change to one list must be made in both files and in the routing table.
- Never touched: `server/clones/**`, `**/src/vendor/**` (except a deliberate `vendor/shared` contract change), migrations, lockfiles.

## Sources behind the rules (`planner`, `implementer`)

Sources were read by a research subagent through a summarizing fetch tool, so rules are close paraphrases. Verify against the live pages before quoting.

| Rule | Source | Applies to |
|---|---|---|
| Explicit `tools` allowlist; without it the agent inherits everything | [Subagents](https://code.claude.com/docs/en/sub-agents) | both |
| No `Agent` in `tools` keeps an agent single-level (nesting is allowed by default, up to 3 layers) | Subagents | both |
| Short, specific `description` drives delegation | Subagents | both |
| Subagents get no conversation history or skills; `skills:` preloads them | Subagents | both |
| Skills with `disable-model-invocation: true` cannot be preloaded, so `pr-self-review` stays a manual step | Subagents | both |
| `skills:` controls preloading, not access; other skills come through `Skill` | Subagents | both |
| Delegation prompt needs objective, output format, tool guidance, task boundaries | [Multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) | `implementer` input, plan handoff |
| Multi-agent runs are costly, so keep the set small | Multi-agent research system | whole set |
| Plan → validate → execute → verify | [Skill best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) | `planner` self-check, `implementer` loop |
| Validate → fix → repeat with specific errors | Skill best practices | `implementer` |
| Fixed output template | Skill best practices | plan and report formats |
| Progressive disclosure: short main file, detail in separate files | Skill best practices, [Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) | shared routing file |

### Sources behind the four newer agents

Read by research subagents, several through search snippets only. Rows marked *unverified* are rationale, not norm; the rules in the prompts rest on local skills and `CLAUDE.md`.

| Rule | Source | Agent |
|---|---|---|
| Frontmatter fields, `hooks`, `permissionMode: plan`, "Bash can still write", hook exit 2 blocks | [Subagents](https://code.claude.com/docs/en/sub-agents) | all four |
| RTL: resemble real usage; role > label > text > testid | [Guiding principles](https://testing-library.com/docs/guiding-principles/), [Query priority](https://testing-library.com/docs/queries/about/#priority) | `test-writer` |
| Common RTL mistakes (2020, may date) | [Kent C. Dodds](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library) | `test-writer` |
| Fastify app factory, `inject()`, `close()` | [Fastify testing](https://fastify.dev/docs/latest/Guides/Testing/) | `test-writer` |
| Do not weaken tests to pass — *unverified, snippet only* | [Best practices](https://code.claude.com/docs/en/best-practices) | `test-writer` |
| Boundary rules as named `from → to` rules | [dependency-cruiser](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md), [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries), [ArchUnit](https://www.archunit.org/userguide/html/000_Index.html) | `architecture-reviewer` |
| Findings as typed records, false-positive reduction — *unverified, blogs/snippets* | [Zylos](https://zylos.ai/research/2026-06-13-ai-code-review-findings-as-structured-data/), [Cloudflare](https://blog.cloudflare.com/ai-code-review/), [Gitar](https://cms.gitar.ai/reduce-false-positives-code-review/) | `architecture-reviewer` |
| Review diff against the plan, evidence over assertion, "don't self-grade", flag only real gaps | [Best practices](https://code.claude.com/docs/en/best-practices), [Verification loops](https://claude.com/blog/building-verification-loops-in-claude-code-with-skills) | `plan-verifier` |
| Traceability matrix, LLM-judge bias — *unverified, snippet only* | [TestRail RTM](https://www.testrail.com/blog/requirements-traceability-matrix/), [arXiv 2410.21819](https://arxiv.org/pdf/2410.21819), [futureagi](https://futureagi.com/blog/evaluating-llm-judge-bias-mitigation-2026/) | `plan-verifier` |
| Four doc types, one per file | [Diátaxis](https://diataxis.fr/) | `doc-writer` |
| Docs change with code, same tooling | [Docs as code](https://www.writethedocs.org/guide/docs-as-code/) | `doc-writer` |
| Mermaid renders from a `mermaid` fence on GitHub | [GitHub diagrams](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams) | `doc-writer` |
| ADR sections (not adopted: the repo has no ADR practice) | [MADR](https://adr.github.io/madr/) | `doc-writer` |

Not from external sources, and not presented as such:

- Mermaid syntax hygiene tips and "RTL cannot render async Server Components" (own knowledge, unverified).
- The planner / implementer / reviewer split is an interpretation of the practices above. No official page prescribes it.
- The plan structure follows `specs/README.md`. The implementer's prohibitions come from `CLAUDE.md` and the `pr-self-review` skill. The requirement to report `*.it.test.ts` skipped without Docker comes from `server/INSIGHTS.md`. The model choices are a judgment call.

## Decisions

1. Skill routing lives in one shared file, not duplicated in each agent.
2. Models: `planner` on `opus`, `implementer` on `sonnet`.
3. `INSIGHTS.md`: `implementer` returns "insight candidates", and the main agent writes them.
4. Plans: `planner` returns text only.
5. The four newer agents get narrow `skills:` lists and their own enforcement (hooks or `permissionMode: plan`); the `planner`/`implementer` sync rule does not apply to them.
6. Hooks are inline in agent frontmatter, not in `.claude/settings.json`, so they do not affect the main session.
7. Diagrams stay inline in the doc they explain; no `docs/adr/` or `docs/diagrams/` until asked for.

## After changing an agent

Restart Claude Code, then check `/agents` for load errors. For the hooked agents, try one forbidden action (for example `test-writer` writing under `src/`) and confirm it is blocked. Try the set on one real step (for example from `docs/improvement-plan.md`) and compare against a run without the agents.
