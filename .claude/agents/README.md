# Agents

Custom subagents for this repo. Each is a single `.md` file with YAML
frontmatter (`name`, `description`, `tools`, `model`) plus a system-prompt
body. `description` is what Claude Code matches against a task to decide
delegation — read the file itself for the full behavioral contract; this
README is a map, not a copy.

## Catalog

| Agent | Responsibility | Tools | Model | Input | Output |
|---|---|---|---|---|---|
| [researcher](researcher.md) | Fact-finding backed by evidence — repo history/code or external sources. Never modifies files. | `Read, Grep, Glob, Bash, WebFetch, WebSearch` | sonnet | A concrete question, scoped to repo and/or external sources | A structured report (`Findings / Evidence / References / Could not determine`) — no files written |
| [spec-creator](spec-creator.md) | Turns a feature idea into a feature-spec — problem, goals/non-goals, user stories, EARS acceptance criteria (`AC-1`, `AC-2`…) with story→AC traceability, edge cases, non-functional needs, input provenance. Works through six clarification categories, asking blocking questions only for the highest-impact gaps and leaving the rest as inline `[NEEDS CLARIFICATION: …]`. Loads project skills per category, dispatches `researcher` for lookups this repo can't answer, analyzes user-supplied design sources, self-checks the draft before finishing. Never writes a plan or code. | `Read, Grep, Glob, Bash, WebFetch, Skill, Write, Agent, mcp__devdigest__get_conventions, mcp__devdigest__get_blast_radius, mcp__devdigest__get_findings` | opus | A feature idea, optionally with design sources (text, screenshots, Figma link, existing code) | `specs/NN-slug.md` (cross-module) or `<module>/specs/NN-slug.md` (single-module), plus a report: path, chosen location and why, Goals/Non-goals summary, traceability confirmation, `researcher` dispatches made, open `[NEEDS CLARIFICATION: …]` items |
| [implementation-planner](implementation-planner.md) | Turns requirements — a `spec-creator` spec, or a small clear request planned directly — into a Development Plan: reads touched modules' `CLAUDE.md`/`LEARNINGS.md`, checks for an overlapping plan, confirms single- vs multi-agent execution, assigns which skills the implementer must load per file/module. Never writes a feature-spec or implementation code. | `Read, Grep, Glob, Bash, Skill, Write` | opus | A `specs/NN-slug.md` path, or a feature request clear enough to plan directly (asks clarifying questions first if it's vague, and recommends routing through `spec-creator` if it isn't) | `plans/NN-slug.md`, plus a short report: file path, requirements planned against, execution mode chosen, Approach summary, open judgment calls |
| [implementer](implementer.md) | Executes an existing Development Plan across `server/` and `client/`, loading the skills the plan assigns, running the tests/typecheck it specifies, checking only its own diff against the plan. Does not perform architecture or security review. | `Read, Edit, Write, Grep, Glob, Bash, Skill` | sonnet | A `plans/NN-slug.md` path (or the plan text) — stops and asks if none is given | Changed files by module, skills applied and why, test/typecheck results, deviations from the plan flagged explicitly |
| [test-writer](test-writer.md) | Writes tests for existing code (post-implementer or backfill), routing to `react-testing-library`/`fastify-best-practices`/`drizzle-orm-patterns`/`zod`/`typescript-expert` per path, and runs the suites it writes. Never fixes the implementation under test — a failing test is reported, not patched. | `Read, Edit, Write, Grep, Glob, Bash, Skill` | sonnet | Which files/modules to test, and new-coverage vs backfill | Test files by module, skills loaded and why, commands run with exit codes/banners, coverage decisions, any suspected bug reported not fixed |
| [architecture-reviewer](architecture-reviewer.md) | Reviews a diff against `onion-architecture` (server/src) and `frontend-ui-architecture` (client), running `pnpm arch` as the deterministic gate for backend and treating frontend findings as judgment only. Read-only; distinguishes new violations from the known-violations baseline. | `Read, Grep, Glob, Bash, Skill` | sonnet | A diff (branch/staged/ref range) | Deterministic gate result, findings with file:line + severity + CONFIRMED/PLAUSIBLE, pre-existing (non-blocking) list, not-reviewed paths |
| [plan-verifier](plan-verifier.md) | Checks a finished implementation against its `plans/NN-slug.md` plan, item by item, verdicting each `DONE`/`PARTIAL`/`MISSING`/`CONTRADICTED` with file:line evidence — and traces coverage back to the spec's `AC-#` ids where the plan names one. Answers only "was this built as specified" — no code-quality opinion. Read-only. | `Read, Grep, Glob, Bash` | sonnet | A plan path **and** how to see the implementation — stops and asks if either is missing | A `PASS`/`INCOMPLETE` verdict, a traceability table (plan item + AC-ID), gaps expanded, verification commands run, items that couldn't be mechanically checked |
| [doc-writer](doc-writer.md) | Turns a shipped feature or finished plan into documentation, filing it per `docs/README.md`'s table (`docs/`, package README, module `LEARNINGS.md`, or `CLAUDE.md`) and adding Mermaid diagrams only where they earn their place. Writes Markdown only, never source; never touches `docs/agent-prompts/`, `specs/`, or `plans/`. | `Read, Edit, Write, Grep, Glob, Bash, Skill` | sonnet | What shipped or which doc is stale | Files created/updated with the destination rule used, diagrams added and why, pointers updated, anything left undocumented for lack of verification |

`architecture-reviewer` and `plan-verifier` moved from `opus` to `sonnet`
(2026-08-12) for cost — `opus` is expensive to run per-gate, and both can run
multiple times per feature via the `implement-plan` skill's fix loop.
`architecture-reviewer`'s backend check is still backed by the deterministic
`pnpm arch` command regardless of model, which bounds the downgrade's risk.
`plan-verifier` has no equivalent deterministic backstop for its own
judgment (matching plan claims to file:line evidence) — watch its first few
real `PASS`/`INCOMPLETE` verdicts under `sonnet` before trusting it
unattended; move it back to `opus` if it starts missing gaps
`architecture-reviewer`/manual review later catches.

Running `implementer` → `plan-verifier` → `architecture-reviewer` by hand
means copying file paths between them and manually re-running
`architecture-reviewer` after every fix. The
[`implement-plan`](../skills/implement-plan/SKILL.md) skill drives that
three-agent sequence in one command, starting from an existing
`plans/NN-slug.md` — same `plan-verifier`-first gate, plus a capped auto-fix
loop for `architecture-reviewer` findings. `spec-creator` and
`implementation-planner` are deliberately **not** part of it — run those by
hand first; `test-writer` is currently skipped by the skill too, for cost,
and is a separate manual step until that changes. It does not replace
deciding when to invoke each agent by hand for a partial run; it's the
default path for "I have a plan, implement and verify it" once a plan
already exists. Once a run through this pipeline finishes, the
[`workflow-retro`](../skills/workflow-retro/SKILL.md) skill can retrospect
on how the agents themselves coordinated — tokens, order, handoffs — a
separate, manual-only step, distinct from what any agent above reports.

## How they fit together

```
feature idea → spec-creator → specs/NN-slug.md ─┐
                                                 ├→ implementation-planner → plans/NN-slug.md → implementer → code
   small/clear request ─────────────────────────┘                                                                │
   (skips spec-creator)                                                                                          ▼
                                                                                                             plan-verifier
                                                                                                          (gate — run first)
                                                                                             INCOMPLETE ◄────────┴────────► PASS
                                                                                                  │                          │
                                                                                          back to implementer      ┌────────┴────────┐
                                                                                                                    ▼                 ▼
                                                                                                       architecture-reviewer     test-writer → tests
                                                                                                        (independent of each other — run in parallel)
                                                                                                                    │                 │
                                                                                                                    └────────┬────────┘
                                                                                                                             ▼
                                                                                                                       doc-writer → docs/
```

**Recommended order, not just a dependency graph.** Run `plan-verifier` first,
right after `implementer`, before `architecture-reviewer` or `test-writer`.
It's the cheapest of the three read-only checks — no `Skill` tool, no
architecture-skill catalog to load — and its verdict can send you back to
`implementer` for rework. Running `architecture-reviewer` or `test-writer`
before that gate risks producing a report or a set of tests against code that
`plan-verifier` is about to flag `CONTRADICTED` or `MISSING`, both of which
are wasted runs the moment the underlying diff changes. Once `plan-verifier`
reports `PASS`, `architecture-reviewer` and `test-writer` are independent of
each other and safe to run in parallel — neither reads the other's output.

`spec-creator` → `implementation-planner` → `implementer` is a chain of
producer/consumer pairs, but none of them talk to each other directly — a
subagent without `fork` starts with no memory of the conversation that
invoked it, so each file on disk *is* the handoff. Every agent below reads
its inputs cold, which is also why `implementation-planner` can skip
`spec-creator` for a small, already-clear request: it does a lighter version
of the same clarification itself rather than block on a formal spec that
isn't worth writing.

`plan-verifier` takes **two** inputs — the plan and the implementation, plus
(where the plan names one) the spec it traces `AC-#` ids back to — because
it's checking the code against them, not producing a third artifact; every
other agent here takes a single input. `architecture-reviewer` and
`plan-verifier` are both read-only and produce reports, not commits: neither
has a `Write` or `Edit` tool. No agent in this pipeline hands off to the
*next stage* automatically — that handoff is always a file on disk, invoked
by the user. `spec-creator` is the one exception to "never invokes another
agent": it may dispatch `researcher` (only `researcher`, never any other
agent, never itself) for a fact-finding lookup this repo can't answer —
that's a tool call *within* its own run, not a stage handoff, so it doesn't
skip the user's role in deciding when to move to `implementation-planner`.
`/security-review` remains a slash command, deliberately not an agent here,
and stays outside this diagram.

No agent performs another's job. `spec-creator` never writes a plan or code
(no `Edit`) and never states an implementation approach; `implementation-planner`
never writes a feature-spec and never edits source code (no `Edit`);
`implementer` never decides scope on its own — an underspecified plan gets a
question, not an assumption; `test-writer` never patches the implementation
it's testing; `architecture-reviewer` and `plan-verifier` never fix what they
find; `doc-writer` never writes source, a spec, or a plan.

## Sources

Every agent's rules are drawn from two kinds of sources: Anthropic's official
Claude Code docs and published external practice (general subagent/skill
design), and this repo's own existing conventions (internal, concrete prior
art). No agent's prompt invents a convention that isn't traceable to one of
these.

**External — Claude Code docs (docs.claude.com, accessed 2026-08-04):**
- *Create custom subagents* — `description` drives auto-delegation and must
  state what+when; `tools` is an explicit allowlist, not "inherit
  everything"; a subagent's prompt body is its entire context, so it must be
  self-contained; a subagent without `fork` has no memory of the inviting
  conversation.
- *Skill authoring best practices* — match the degree of freedom in
  instructions to task fragility: judgment-heavy work (planning) gets open
  steps and a clarify gate; fragile, sequential work (implementation against
  migrations/contracts) gets numbered steps and explicit "don't deviate"
  language.

**Internal — this repo's existing agent/skill conventions:**
- [researcher.md](researcher.md) — style precedent for both new agents:
  capability-backed prohibitions (a restriction is real because the tool is
  absent, not just stated), a "Step 0 — clarify the task" gate, a closing
  "must not do" section, and a fixed output contract.
- [`.claude/skills/pr-self-review/SKILL.md`](../skills/pr-self-review/SKILL.md)
  Phase 3 — the path-glob → skill-list routing table `implementation-planner`
  bases its "Skills for implementer" section on, and `implementer` falls back
  to for any path the plan doesn't cover. Also the source of the exact
  `cd <abs-path> || exit 1; rc=$?` shape `implementer` uses to avoid a
  false-green test run, and the precedent for one agent explicitly listing
  what it does *not* review.
- [`specs/README.md`](../../specs/README.md) — the spec's shape (EARS
  acceptance criteria, `AC-#` ids, `[NEEDS CLARIFICATION: …]`) and
  `NN-slug.md` numbering that `spec-creator` writes to, split by cross-module
  (root) vs single-module (`<module>/specs/`) scope. Specs `01`–`08` predate
  this shape and are documented there as a legacy format, not migrated.
- [`plans/README.md`](../../plans/README.md) — the plan's fixed shape
  (`Source requirements / Clarifications & recommendations / Execution mode /
  Modules affected / Architectural constraints / Approach / Skills for
  implementer / Verification`) and `NN-slug.md` numbering that
  `implementation-planner` writes to.
- Root [`CLAUDE.md`](../../CLAUDE.md) and each module's own `CLAUDE.md` /
  `LEARNINGS.md` — "read the module's `LEARNINGS.md` before you start,
  treat it as high-confidence" is a repo-wide rule both agents apply to
  every module they touch.
- [`.claude/skills/README.md`](../skills/README.md) — the skill catalog
  `implementation-planner` draws exact skill names from, so the plan never
  paraphrases a skill into something that doesn't exist.

**External sources for `spec-creator` (accessed 2026-08-11):**
- Alistair Mavin et al., *Easy Approach to Requirements Syntax (EARS)*
  (originated at Rolls-Royce, 2009) — the five requirement patterns
  (Ubiquitous, Event-driven, State-driven, Unwanted behavior, Optional
  feature) `spec-creator` phrases every `AC-#` in, chosen specifically because
  each pattern collapses to one unambiguous, testable statement.
- GitHub's Spec Kit `/clarify` command taxonomy — the shape behind
  `spec-creator`'s six clarification categories (functional scope, domain/
  data model, UX/interaction flow, non-functional quality attributes,
  integration/cross-module dependencies, edge cases/failure handling) and the
  `[NEEDS CLARIFICATION: …]` marker used instead of guessing.

**External sources for `test-writer`, `architecture-reviewer`,
`plan-verifier`, `doc-writer` (gathered and verified 2026-08-04):**

- *Create custom subagents*, https://code.claude.com/docs/en/sub-agents —
  omitting `tools` inherits every available tool (why every file here sets it
  explicitly); a subagent's body is its entire context; built-in
  `Explore`/`Plan` subagents deny `Write`/`Edit` as their read-only
  enforcement — the same pattern `architecture-reviewer` and `plan-verifier`
  use; the "chain subagents" pattern is the general shape behind
  spec-creator → implementation-planner → implementer → plan-verifier,
  though no Anthropic source names a plan-verification stage by that name.
- *Best practices for Claude Code*, https://code.claude.com/docs/en/best-practices —
  "have Claude show evidence rather than asserting success: the test output,
  the command it ran and what it returned" (`test-writer`'s Output contract);
  "have one Claude write tests, then another write code to pass them" — the
  writer/reviewer split behind keeping `test-writer` separate from
  `implementer`.
- Tembo.io, *Claude Code Subagents: A 2026 Practical Guide* — a published
  test-writer example with the same `Read, Write, Edit, Bash, Glob, Grep`
  tool set, `Bash` included specifically to run the tests it writes.
- Skyramp.dev, *Testing AI-Generated Code: Best Practices for 2026* — "you
  cannot use the same AI system to write code and then test it" — shared
  blind spots, the rationale behind `test-writer`'s Step 6.
- Lukas Niessen, *Fitness Functions: Automating Your Architecture Decisions* —
  dependency-cruiser is the same pattern as ArchUnit/NetArchTest/JDepend
  across ecosystems; architecture conformance belongs in an automated,
  deterministic gate — exactly what `server/package.json`'s `depcruise src
  --ignore-known` already is, hence `architecture-reviewer`'s
  "deterministic gate first, judgment second".
- Luismori.dev, *How to Build a Good Agentic Code Reviewer* — "reject
  comments that cannot point to concrete evidence in the diff… no evidence,
  no comment" — `architecture-reviewer`'s evidence gate.
- Diffray.ai, *LLM Hallucinations in AI Code Review* — single-source figures
  on AI-review false positives, cited as a reason to combine LLM review with
  a deterministic check rather than trust either alone.
- ASDLC.io, *Adversarial Code Review* — "Quality Gates (deterministic)…
  Review Gates (probabilistic, adversarial)… Critics produce either PASS or a
  list of spec violations" — why `plan-verifier`'s output is a closed
  PASS/INCOMPLETE gate, not advisory.
- Addy Osmani, *How to write a good spec for AI agents* — "after implementing,
  compare the result with the spec and confirm all requirements are met" —
  the core of `plan-verifier`'s Step 3.
- Aqua-cloud, *TOP 11 Best Practices for Requirement Traceability with AI* —
  the requirements-traceability-matrix pattern behind `plan-verifier`'s
  traceability table, contrasted explicitly with quality-focused peer review.
- Mintlify, *Documentation diagrams: when to use them and how to keep them
  accurate* — "if your diagram and your prose say the exact same thing, one
  of them is redundant" — `doc-writer`'s Step 4.
- Docsio, *What Is Docs as Code? A Practical Guide for 2026* — docs-as-code
  as the same Git/PR/CI workflow as source, paired with a human-review gate —
  this repo's own PR review already is that gate, so `doc-writer` needs no
  approval step of its own.

A full breakdown of which specific rule maps to which line in each agent's
prompt was produced during design review; ask for it again if you need the
line-level trace rather than this summary.
