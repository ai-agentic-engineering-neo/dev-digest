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
| [planner](planner.md) | Turns a feature request into a Development Plan: reads touched modules' `CLAUDE.md`/`LEARNINGS.md`, checks for an overlapping spec, assigns which skills the implementer must load per file/module. Never writes implementation code. | `Read, Grep, Glob, Bash, Skill, Write` | opus | A feature request (asks clarifying questions first if it's vague) | `specs/NN-slug.md`, plus a short report: file path, Scope summary, open judgment calls |
| [implementer](implementer.md) | Executes an existing Development Plan across `server/` and `client/`, loading the skills the plan assigns, running the tests/typecheck it specifies, checking only its own diff against the plan. Does not perform architecture or security review. | `Read, Edit, Write, Grep, Glob, Bash, Skill` | sonnet | A `specs/NN-slug.md` path (or the plan text) — stops and asks if none is given | Changed files by module, skills applied and why, test/typecheck results, deviations from the plan flagged explicitly |
| [test-writer](test-writer.md) | Writes tests for existing code (post-implementer or backfill), routing to `react-testing-library`/`fastify-best-practices`/`drizzle-orm-patterns`/`zod`/`typescript-expert` per path, and runs the suites it writes. Never fixes the implementation under test — a failing test is reported, not patched. | `Read, Edit, Write, Grep, Glob, Bash, Skill` | sonnet | Which files/modules to test, and new-coverage vs backfill | Test files by module, skills loaded and why, commands run with exit codes/banners, coverage decisions, any suspected bug reported not fixed |
| [architecture-reviewer](architecture-reviewer.md) | Reviews a diff against `onion-architecture` (server/src) and `frontend-ui-architecture` (client), running `pnpm arch` as the deterministic gate for backend and treating frontend findings as judgment only. Read-only; distinguishes new violations from the known-violations baseline. | `Read, Grep, Glob, Bash, Skill` | opus | A diff (branch/staged/ref range) | Deterministic gate result, findings with file:line + severity + CONFIRMED/PLAUSIBLE, pre-existing (non-blocking) list, not-reviewed paths |
| [plan-verifier](plan-verifier.md) | Checks a finished implementation against its `specs/NN-slug.md` plan, item by item, verdicting each `DONE`/`PARTIAL`/`MISSING`/`CONTRADICTED` with file:line evidence. Answers only "was this built as specified" — no code-quality opinion. Read-only. | `Read, Grep, Glob, Bash` | opus | A spec path **and** how to see the implementation — stops and asks if either is missing | A `PASS`/`INCOMPLETE` verdict, a traceability table, gaps expanded, verification commands run, items that couldn't be mechanically checked |
| [doc-writer](doc-writer.md) | Turns a shipped feature or finished plan into documentation, filing it per `docs/README.md`'s table (`docs/`, package README, module `LEARNINGS.md`, or `CLAUDE.md`) and adding Mermaid diagrams only where they earn their place. Writes Markdown only, never source; never touches `docs/agent-prompts/` or `specs/`. | `Read, Edit, Write, Grep, Glob, Bash, Skill` | sonnet | What shipped or which doc is stale | Files created/updated with the destination rule used, diagrams added and why, pointers updated, anything left undocumented for lack of verification |

## How they fit together

```
feature request → planner → specs/NN-slug.md → implementer → code
                                  │                            │
                                  │                     test-writer → tests
                                  │                            │
                                  └──→ plan-verifier ←─────────┤
                                       architecture-reviewer ←──┤
                                       doc-writer ──────────────┴→ docs/
```

`planner` and `implementer` are a producer/consumer pair, but they don't talk
to each other directly — a subagent without `fork` starts with no memory of
the conversation that invoked it, so the spec file *is* the handoff. It must
be self-contained: every agent below reads its inputs cold.

`plan-verifier` is the one agent that takes **two** inputs — the spec and the
implementation — because it's checking one against the other; every other
agent here takes a single input. `architecture-reviewer` and `plan-verifier`
are both read-only and produce reports, not commits: neither has a `Write` or
`Edit` tool, and neither invokes another agent (no agent in this pipeline
chains automatically — the handoff is always a file on disk, invoked by the
user). `/security-review` remains a slash command, deliberately not an agent
here, and stays outside this diagram.

No agent performs another's job. `planner` never edits source code (no
`Edit`); `implementer` never decides scope on its own — an underspecified
plan gets a question, not an assumption; `test-writer` never patches the
implementation it's testing; `architecture-reviewer` and `plan-verifier`
never fix what they find; `doc-writer` never writes source or a spec.

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
  Phase 3 — the path-glob → skill-list routing table `planner` bases its
  "Skills for implementer" section on, and `implementer` falls back to for
  any path the plan doesn't cover. Also the source of the exact
  `cd <abs-path> || exit 1; rc=$?` shape `implementer` uses to avoid a
  false-green test run, and the precedent for one agent explicitly listing
  what it does *not* review.
- [`specs/README.md`](../../specs/README.md) — the spec's fixed shape
  (`Context / Scope / Approach / Verification`) and `NN-slug.md` numbering
  that `planner` writes to.
- Root [`CLAUDE.md`](../../CLAUDE.md) and each module's own `CLAUDE.md` /
  `LEARNINGS.md` — "read the module's `LEARNINGS.md` before you start,
  treat it as high-confidence" is a repo-wide rule both agents apply to
  every module they touch.
- [`.claude/skills/README.md`](../skills/README.md) — the skill catalog
  `planner` draws exact skill names from, so the plan never paraphrases a
  skill into something that doesn't exist.

**External sources for `test-writer`, `architecture-reviewer`,
`plan-verifier`, `doc-writer` (gathered and verified 2026-08-04):**

- *Create custom subagents*, https://code.claude.com/docs/en/sub-agents —
  omitting `tools` inherits every available tool (why every file here sets it
  explicitly); a subagent's body is its entire context; built-in
  `Explore`/`Plan` subagents deny `Write`/`Edit` as their read-only
  enforcement — the same pattern `architecture-reviewer` and `plan-verifier`
  use; the "chain subagents" pattern is the general shape behind
  planner → implementer → plan-verifier, though no Anthropic source names a
  plan-verification stage by that name.
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
