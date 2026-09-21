# Extend the Claude Code subagent pipeline with four agents

## Context

`.claude/agents/` currently holds three subagents — `researcher`, `planner`,
`implementer` — catalogued in [`.claude/agents/README.md:11-15`](../.claude/agents/README.md).
Two gaps are already visible *inside those files*:

- `implementer.md:40-44` and `implementer.md:75-81` both defer work to
  "the project's architecture/security review agents" — agents that do not
  exist. `.claude/agents/README.md:22-24` labels them "separate review
  agents/skills (architecture, security) — not part of this pipeline",
  which today means: nobody does it.
- Nothing in the pipeline checks *"was this built as the plan specified"*.
  `implementer.md:67-73` explicitly scopes its Step 5 self-check to "a
  correctness check on your own work, not an audit", and `planner` never sees
  the implementation. Plan conformance is unowned.
- Tests and documentation are implicitly `implementer`'s job (its Output
  contract mentions tests, `.claude/agents/README.md:15`), but it is the same
  agent that wrote the code — a shared-blind-spot problem flagged by two
  external sources in [Sources](#sources).

This spec plans four new agent files: `test-writer`, `architecture-reviewer`,
`plan-verifier`, `doc-writer`.

**This spec is a plan for creating four `.md` files. It does not create them.**

### A note on shape

`specs/README.md:16-37` fixes the spec shape around a product feature
(`server` / `client` / `reviewer-core` / `e2e`). This change touches none of
them — it is Claude Code *tooling* configuration. The shape below is adapted
deliberately, and each adaptation is named where it happens:

| Template section | Adapted to |
|---|---|
| `## Modules affected` | `.claude/agents/` only — plus the exact README edits |
| `## Skills for implementer` | *Skills each new agent must be designed to route to* |
| `## Approach` | Per-agent frontmatter draft + body outline, ×4 |
| — | `## Sources` added (precedent: `.claude/agents/README.md:39-83`) |

---

## Scope

**In:**

1. Four new files under `.claude/agents/`:
   `test-writer.md`, `architecture-reviewer.md`, `plan-verifier.md`,
   `doc-writer.md` — each following the house style fixed in
   [Architectural constraints](#architectural-constraints).
2. Updates to `.claude/agents/README.md`:
   - four new rows in the Catalog table (`README.md:11-15`),
   - a rewritten "How they fit together" diagram (`README.md:19-25`) — the
     current one says architecture review is "not part of this pipeline",
     which stops being true,
   - the "Sources behind planner and implementer" section
     (`README.md:39-83`) renamed and extended to cover all seven agents.
3. Nothing else. No product code, no skills, no `docs/` changes.

**Out (explicitly):**

1. **No new skill.** In particular, no backend-testing skill — see
   [Skills routing](#skillsconventions-each-new-agent-must-be-designed-to-route-to).
   `test-writer` routes to skills that already exist.
2. **No security-reviewer agent.** `/security-review` already exists as a
   slash command; `implementer.md:43` points at it by name. Adding a seventh
   agent that duplicates it is out of scope for this pass.
3. **No changes to `docs/agent-prompts/`.** Those are the *product's* DB-backed
   review-agent prompts (`docs/agent-prompts/README.md:1-19`) and have nothing
   to do with `.claude/agents/`. Keeping them untouched is part of the point —
   see the disambiguation rule in `doc-writer`'s design below.
4. **No orchestrator.** Nothing in Claude Code chains these automatically; the
   handoff stays what `.claude/agents/README.md:27-30` already describes — a
   file on disk, invoked by the user. No agent in this spec invokes another.
5. **No edits to the three existing agent files.** `implementer.md:80-81`
   already says "never substitute your own review pass for the project's
   architecture/security review agents" — that line becomes *accurate* rather
   than aspirational, without needing a rewrite. If a follow-up wants
   `implementer` to name `architecture-reviewer` explicitly, that is a
   separate change.
6. **No CI wiring.** These are interactive subagents, not GitHub Actions jobs.

---

## Modules affected

**None of the product modules.** Not `server/`, not `client/`, not
`reviewer-core/`, not `e2e/`. This is a change to `.claude/agents/` —
Claude Code tooling configuration, version-controlled alongside the code but
not part of any package's build, typecheck, or test suite.

Two consequences worth stating, because they change what "verification" can
mean here:

- There is **no typecheck or test suite** that can fail on a malformed agent
  file. Verification is structural and manual (see
  [Verification](#verification)).
- `pr-self-review` excludes `.claude/skills/**` from review
  (`pr-self-review/SKILL.md:41`) but **not** `.claude/agents/**` — so these
  files *will* land in a self-review diff. That is fine; no deterministic
  check in Phase 1 (`pr-self-review/SKILL.md:50-57`) is keyed to that path,
  so the phase runs no commands and the diff passes through to skill routing,
  which has no row for `.claude/**` either (`pr-self-review/SKILL.md:129-138`).
  Expect "no skills routed" on that diff — that is correct, not a miss.

### Exact `.claude/agents/README.md` changes

**(a) Catalog table** — four rows appended after `implementer`
(`README.md:15`), same six columns (`Agent | Responsibility | Tools | Model |
Input | Output`). Tool and model cells must be copied from each new file's
frontmatter verbatim, not summarized — the table is how a reader checks a
prohibition is capability-backed without opening the file.

**(b) "How they fit together"** (`README.md:19-25`) — the ASCII diagram must be
replaced. Current text asserts review agents are "not part of this pipeline";
after this change `architecture-reviewer` and `plan-verifier` *are*. Proposed
shape (final wording is the implementer's, this is the topology):

```
feature request → planner → specs/NN-slug.md → implementer → code
                                  │                            │
                                  │                     test-writer → tests
                                  │                            │
                                  └──→ plan-verifier ←─────────┤
                                       architecture-reviewer ←──┤
                                       doc-writer ──────────────┴→ docs/
```

with prose stating: `plan-verifier` takes *two* inputs (the spec and the
implementation), which no other agent does; the review agents are read-only
and produce reports, not commits; `/security-review` remains a slash command
and is deliberately not an agent here.

**(c) Sources section** (`README.md:39`) — retitle "Sources behind planner and
implementer" → **"Sources"**, keeping every existing citation intact, and
append the external citations from this spec's [Sources](#sources) grouped by
which agent they justify. `README.md:81-83`'s "ask for the line-level trace"
sentence stays as-is.

---

## Architectural constraints

Cited, not paraphrased. Every one of these is a house-style rule the four new
files must satisfy.

**Frontmatter is exactly four keys** — `name`, `description`, `tools`, `model`
(`.claude/agents/README.md:3-5`; instances at `planner.md:1-6`,
`researcher.md:1-6`, `implementer.md:1-6`). No other keys appear in any
existing file. Note the skills use a different set (`name`, `description`,
`when_to_use`, `version` — `pr-self-review/SKILL.md:1-7`); do not mix them.

**Prohibitions are capability-backed.** `.claude/agents/README.md:59-62` states
this as the style precedent, verbatim: "capability-backed prohibitions (a
restriction is real because the tool is absent, not just stated)".
`researcher.md:4` carries no `Write`/`Edit`; `researcher.md:9-10` then says
"You NEVER edit or create files **(you have no Write or Edit tools)**" —
the prose *cites its own tool list*. `planner.md:100` / `README.md:32-33`
apply the same to `planner`'s missing `Edit`.

**`tools:` is an explicit allowlist, not "inherit everything"**
(`.claude/agents/README.md:48-49`). Anthropic's docs confirm omitting `tools`
inherits every available tool — so omission is never acceptable in this repo.

**`description` drives auto-delegation and must state what + when**
(`.claude/agents/README.md:5-7,47-48`). Every existing description is 1-3
sentences, third-person, and ends with a "Use it when… / do not use it to…"
clause: `researcher.md:3`, `planner.md:3` ("Use before non-trivial or
cross-module…"), `implementer.md:3` ("Use to carry out an existing plan; do
not use it to decide what to build — that is the planner's job").

**A subagent's body is its entire context** (`.claude/agents/README.md:49-51`;
`implementer.md:11-13` "You start with no memory of whatever conversation
produced the plan"). Each new file must be self-contained and must not assume
the invoking conversation's context.

**"Step 0 — clarify the task" gate**, then numbered `## Step N` sections:
`researcher.md:20-40`, `planner.md:18-32`, `implementer.md:15-19`. Note
`implementer`'s Step 0 is a *hard stop* ("stop and ask for one"), not a
question-asking gate — the pattern flexes by how fragile the task is
(`.claude/agents/README.md:52-56`: "match the degree of freedom in
instructions to task fragility").

**Closing `## What you must not do` + `## Output`** — `planner.md:98-116`,
`implementer.md:75-91`. `researcher.md` is the exception: it uses
`## General rules` (`researcher.md:111-119`) plus per-type report templates
(`researcher.md:53-74,85-105`) instead. Both variants are acceptable house
style; the read-only reviewers below follow `researcher`'s template-block
shape, the writing agents follow `planner`/`implementer`'s.

**Evidence is `file:line`, never vague.** `researcher.md:64-65` —
"(Every piece of evidence is tied to a specific file/line/commit, never a
vague 'somewhere in the code'.)"; `planner.md:78-79,102` — constraints "cited
as `path:line`… not paraphrased from memory".

**Skill names must be exact, never paraphrased** — `planner.md:54-56`: "it
must name skills by their exact `.claude/skills/` name, not paraphrase them";
the catalog to draw from is `.claude/skills/README.md:9-22`.

**Skill scope boundaries are declared by the skills themselves and must be
respected** — `pr-self-review/SKILL.md:140-141`: "`onion-architecture` covers
`server/src` only; `frontend-ui-architecture` covers the client only", backed
at source by `onion-architecture/SKILL.md:10-12` (out of scope:
`reviewer-core/`, `client/`) and `frontend-ui-architecture/SKILL.md:8-11`.

**Known debt is not a finding.** `pr-self-review/SKILL.md:105-119` — the
baseline (`server/.dependency-cruiser-known-violations.json`,
`docs/improvement-plan.md`, module `LEARNINGS.md`) is loaded *before* judging;
a matching finding is dropped or MEDIUM-tagged `pre-existing`, never a
blocker — **except regression**.

**Verify before reporting.** `pr-self-review/SKILL.md:198-211` — the four
gating questions and the `CONFIRMED` / `PLAUSIBLE` / dropped tri-state, with
"**No failure scenario means it is not a finding.**"

**Deterministic checks carry the verdict; skill findings are advisory.**
`pr-self-review/SKILL.md:13` — "A gate whose answer changes between runs on
the same diff gets bypassed within weeks" (`SKILL.md:15`).

**The false-green command shape is mandatory and must not be improvised.**
`pr-self-review/SKILL.md:66-90` — absolute `cd … || exit 1`, `rc=$?` on the
same line, no pipe, check the `> @devdigest/…` banner. `implementer.md:64-65`
already restates it. Any new agent that runs a package command must too.

**Spec shape and numbering** — `specs/README.md:10-14` (`NN-short-slug.md`,
chronological id, not priority), `specs/README.md:20-37` (the four sections).
`plan-verifier` reads against this shape.

**`docs/` filing decision table** — `docs/README.md:6-23`: cross-package flows
and multi-package design decisions → `docs/`; package-internal detail → that
package's `README.md`; lessons learned → module `LEARNINGS.md`; feature specs
→ `specs/`; anything an agent loads every session → a `CLAUDE.md`, kept short.
`doc-writer` routes on this table.

**Root `CLAUDE.md`'s closing rule** applies to every agent that finishes a
substantive task: append to the touched module's `LEARNINGS.md` via
`engineering-insights`, read it first, extend rather than duplicate, write
nothing if nothing non-obvious came up.

*Judgment call (mine, not read anywhere):* the "Step 0 gate" is treated below
as mandatory for all four new agents, including the read-only ones. No file
states it as a rule — it is inferred from all three existing files having one.

---

## Approach

One subsection per agent. Each gives the frontmatter to write verbatim and an
outline of the body's sections. **These are outlines, not the finished prose** —
whoever writes the file supplies the wording in house voice.

Common to all four:

- Body opens with `You are a … agent (<name>).` + one-sentence job statement,
  matching `researcher.md:8`, `planner.md:8-11`, `implementer.md:8-13`.
- Any prohibition that maps to a missing tool must **name the missing tool in
  prose**, `researcher.md:9-10` style.
- Any package command uses the `pr-self-review/SKILL.md:70-76` shape.
- Ends with `## What you must not do` and `## Output` (or `researcher`-style
  report templates where noted).

### 1. `test-writer.md`

```yaml
name: test-writer
description: >
  Writes tests for existing code across client/ and server/, loading this
  project's own testing skills per file type — react-testing-library for
  client components and hooks, fastify-best-practices / drizzle-orm-patterns
  plus plain Vitest for server code — and runs the suites it writes until
  they pass. Never edits the implementation under test: a failing test is a
  reported finding, not something to fix by changing source. Use it after an
  implementer pass, or to backfill coverage for existing code. Do not use it
  to write the feature itself.
tools: Read, Edit, Write, Grep, Glob, Bash, Skill
model: sonnet
```

Tools rationale — `Write`/`Edit` for test files, `Bash` to actually run the
suite (Tembo's published test-writer example carries the same set, and
*Best practices* requires showing test output as evidence rather than
asserting success), `Skill` for the routing below.

Body outline:

- **Step 0 — scope the target.** Needs: which files/modules to test, and
  whether this is new-code coverage or a backfill. Vague request ("add tests")
  → ask, `planner.md:18-32` style, not `implementer`'s hard stop.
- **Step 1 — read before writing.** `TESTING.md` (philosophy: "typological,
  not exhaustive", `TESTING.md:8-23`; the suite map, `TESTING.md:27-33`), then
  the target module's `LEARNINGS.md`. State plainly that `client/LEARNINGS.md`
  records concrete RTL traps and is read as high-confidence.
- **Step 2 — route skills by path** (table reproduced in
  [Skills routing](#skillsconventions-each-new-agent-must-be-designed-to-route-to)).
  Must state the honest gap: **there is no backend-testing skill** in
  `.claude/skills/README.md:9-22`; server tests are written from `TESTING.md`
  + the module's existing test files + plain Vitest, and the agent must say
  so rather than invent a skill name (`planner.md:54-56`).
- **Step 3 — decide what is worth testing.** Anchored in `TESTING.md:23`
  ("If a test wouldn't catch a class of regression we care about, we don't
  write it") and RTL's "write fewer, longer tests" / "each test must justify
  its existence" (`react-testing-library/SKILL.md:14-18`). Mock at the
  boundary only: `server/src/adapters/mocks.ts` for LLM/git/GitHub
  (`TESTING.md:16-17`), MSW or a mocked `fetch` on the client
  (`TESTING.md:37-39`); never mock the component under test.
- **Step 4 — write the tests**, placing integration tests as `*.it.test.ts`
  only when the workflow is genuinely data-backed (`TESTING.md:18-19,46-50`,
  self-skips without Docker).
- **Step 5 — run them, with output.** Per-module commands from
  `pr-self-review/SKILL.md:50-57`, in the `SKILL.md:70-76` shape. Report the
  captured `rc` and the `> @devdigest/…` banner, not a claim of success.
- **Step 6 — when a test fails.** The load-bearing rule: a red test means
  either the test is wrong (fix the test) or the code is wrong (**report it,
  do not fix it**). Cross-reference the writer/reviewer split rationale in
  [Sources](#sources).
- **What you must not do:** never edit non-test source to make a test pass;
  never leave `.only(` (CRITICAL per `pr-self-review/SKILL.md:150`) or `.skip(`
  (`SKILL.md:156`); no snapshot tests; no `getByTestId` where a role query
  works; never assert on internal state or hook calls
  (`react-testing-library/SKILL.md:16-17`); never claim a suite passed without
  showing its output.
- **Output:** test files added/changed by module · skills loaded and why ·
  the exact commands run with exit codes and banner lines · which behaviours
  are covered and which were deliberately skipped and why · any suspected
  production bug surfaced by a test, reported not fixed.

**Known limitation to state in the file (mine, flagged):** "never edit the
implementation" **cannot** be capability-backed — `Edit`/`Write` are not
path-scopable in Claude Code, and the agent needs both for test files. This is
the one prohibition in this spec that is prose-only. Compensating control: the
`## Output` contract forces a per-file listing, so a source edit is visible in
the report, and the diff shows it. The file should say this out loud rather
than imply the restriction is enforced.

### 2. `architecture-reviewer.md`

```yaml
name: architecture-reviewer
description: >
  Reviews a diff against this repo's architectural boundaries — onion-architecture
  for server/src, frontend-ui-architecture for client/ — and reports violations
  backed by file:line evidence from the diff itself. Read-only: it has no Write
  or Edit tool and never fixes what it finds. Distinguishes new violations from
  the grandfathered baseline in server/.dependency-cruiser-known-violations.json.
  Use it after an implementation pass, before opening a PR. Not a general code
  review, not a security review (/security-review), and not a check that the
  plan was followed (plan-verifier).
tools: Read, Grep, Glob, Bash, Skill
model: opus
```

Tools rationale — no `Write`, no `Edit`: the prohibition is the tool list, per
`.claude/agents/README.md:59-62` and Anthropic's own built-in `Explore`/`Plan`
subagents ("read-only tools; Write and Edit are denied"). `Bash` is required
and non-negotiable: it runs `git diff` and, critically, `pnpm arch` — the
deterministic half of the verdict. `Skill` loads the two architecture skills.

Body outline:

- **Step 0 — resolve the diff.** Which diff (branch vs `main`, staged, a ref
  range) and which packages it touches. Reuse `pr-self-review/SKILL.md:28-42`'s
  resolution and exclusion list verbatim — including that `client/src/vendor/**`
  and `server/src/vendor/**` are "vendored, explicitly out of scope for both
  architecture skills" (`SKILL.md:40-41`). If nothing survives the filter:
  report and stop (`SKILL.md:44`).
- **Step 1 — run the deterministic gate first.** `pnpm arch` for `server/**`
  (`pr-self-review/SKILL.md:53`, CRITICAL on failure), in the `SKILL.md:70-76`
  shape. State why it comes first: `server/package.json:12`'s
  `depcruise src --ignore-known` already subtracts the baseline, so **a
  failure is a NEW violation** (`pr-self-review/SKILL.md:100-101`). Also state
  the asymmetry: **there is no equivalent machine gate for `client/`** —
  frontend findings are skill-derived judgment only, and the report must label
  them as such. This is the `SKILL.md:13` verdict/advisory split applied.
- **Step 2 — load the baseline.** `server/.dependency-cruiser-known-violations.json`,
  `docs/improvement-plan.md`, touched modules' `LEARNINGS.md`
  (`pr-self-review/SKILL.md:105-119`). Restate the drop/`pre-existing`/
  regression-exception rule.
- **Step 3 — route the architecture skills, respecting their scope.**
  `onion-architecture` → `server/src/**` only, never `reviewer-core/` or
  `client/` (`onion-architecture/SKILL.md:10-12`);
  `frontend-ui-architecture` → `client/**` only
  (`frontend-ui-architecture/SKILL.md:8-11`); `reviewer-core/**` →
  `typescript-expert` only, "onion-architecture excludes it"
  (`pr-self-review/SKILL.md:137`).
- **Step 4 — check the two easy-to-violate call-path rules** from
  `docs/architecture.md`: components never fetch directly (the path is
  `client hook → api.ts → server routes.ts → service.ts → repository.ts →
  Postgres`), and services depend on interfaces, not adapters
  (`service.ts → container.ts → adapters/`).
- **Step 5 — verify before reporting.** The four gating questions and
  `CONFIRMED` / `PLAUSIBLE` / dropped tri-state verbatim from
  `pr-self-review/SKILL.md:198-211`, plus the external "no evidence, no
  comment" rule. Findings land on lines present in the diff
  (`SKILL.md:163-165`); relocated code is not new code (`SKILL.md:167-176`).
- **What you must not do:** never fix anything (no `Write`/`Edit` — say so);
  never report a finding without a `file:line` that exists in the diff; never
  flag a baseline violation as a blocker; never review security
  (`/security-review`), test quality, or plan conformance (`plan-verifier`);
  never review `vendor/**`; never present a client-side judgment call as if a
  machine gate produced it.
- **Output** (`researcher`-style template block, `researcher.md:53-74`):
  `## Deterministic result` (the `pnpm arch` command, exit code, banner, and
  any new edge printed, with rule name) · `## Findings` (one block each:
  severity CRITICAL/HIGH/MEDIUM per `pr-self-review/SKILL.md:220-225`, the
  `file:line`, the rule and which skill it comes from, the concrete failure
  scenario, CONFIRMED/PLAUSIBLE) · `## Pre-existing, not blocking` ·
  `## Not reviewed` (paths excluded and why — vendored, `docs/`, no skill
  covers it).

### 3. `plan-verifier.md`

```yaml
name: plan-verifier
description: >
  Checks a finished implementation against the specs/NN-slug.md plan it was
  meant to satisfy, item by item, and reports which plan items are done,
  partially done, missing, or contradicted — each with file:line evidence.
  Answers only "was this built as specified", never "is this good code":
  quality, architecture and security belong to other agents. Read-only — no
  Write or Edit tool. Use after an implementer pass, given both the spec path
  and the diff. Requires a spec; it will not infer one.
tools: Read, Grep, Glob, Bash
model: opus
```

Tools rationale — no `Write`/`Edit` (read-only gate). **No `Skill`, on
purpose**: giving it the skill catalog is the single most likely way it drifts
into generic code review, which is the one thing it must not do. That
prohibition is therefore capability-backed too. `Bash` is included so it can
`git diff` the implementation and *re-run the plan's own `## Verification`
commands* — a plan item that says "these tests pass" is only verifiable by
running them (see judgment call in the report).

Body outline:

- **Step 0 — hard stop, `implementer.md:15-19` style.** Two inputs are
  required: the `specs/NN-slug.md` path **and** how to see the implementation
  (branch, diff range, or "working tree"). Missing either → stop and ask.
  Never infer a spec from the code; never review code with no spec.
- **Step 1 — build the checklist.** Read the spec in full and decompose it
  into discrete, individually checkable claims, keyed to spec line numbers.
  Point at `specs/02-review-agent-skills.md` as the worked example of what a
  real spec's checkable surface looks like: itemized Scope In/Out
  (`02:53-84`), a numbered Build order (`02:649-669`), and a Verification
  section already split into Automated (`02:732`), a control experiment
  (`02:766`), a 10-item manual checklist (`02:791-812`) and pre-existing
  acceptance items (`02:814-821`). Also note the smaller shape:
  `specs/03-conventions-extractor.md:43-60` numbers its Scope items 1..N
  directly.
- **Step 2 — the out-of-scope guard.** Every spec's Scope names what is
  *explicitly not* in scope (`specs/README.md:27-28`; e.g.
  `04` above, `02:53-84`). Those items are **not gaps** and must never be
  reported as missing. A `## Before you finish` section
  (`03:288-294`) is a plan item like any other — `LEARNINGS.md` entries
  count.
- **Step 3 — trace each item to evidence.** For every checklist item, find the
  code that satisfies it and cite `file:line`, or record its absence.
  Verdict per item: `DONE` / `PARTIAL` / `MISSING` / `CONTRADICTED` (built,
  but differently from what the plan says). `CONTRADICTED` is the interesting
  one — `implementer.md:77-81` allows deviation only if reported, so a silent
  deviation is a finding even when the code is better.
- **Step 4 — run the plan's own Verification section.** Whatever commands the
  spec's `## Verification` names, in the `pr-self-review/SKILL.md:70-76`
  shape. A manual/browser checklist item that cannot be run gets
  `NOT MECHANICALLY CHECKABLE — needs a human`, never a guessed pass.
- **Step 5 — apply the evidence gate.** Reuse `pr-self-review/SKILL.md:198-208`'s
  first three questions (does the file:line exist / still true in context /
  already handled). Question 4 ("state a concrete failure scenario") does
  **not** apply here — a missing plan item is a gap whether or not it crashes
  anything. Say that explicitly, so the agent does not import the whole gate
  and silently drop real gaps.
- **What you must not do:** never suggest improvements, refactors, naming, or
  style — "the code could be cleaner" is not a plan gap; never report an
  explicitly-out-of-scope item as missing; never review architecture
  (`architecture-reviewer`) or security (`/security-review`); never pass an
  item it could not find evidence for; never fix anything (no `Write`/`Edit` —
  say so); never accept "tests pass" as satisfying a plan item without having
  run them or marked them unrun.
- **Output:** a single verdict line — `PASS` (every in-scope item `DONE`) or
  `INCOMPLETE` — followed by a traceability table (`plan item + spec line │
  status │ evidence file:line`), then `## Gaps` (each `MISSING`/`PARTIAL`/
  `CONTRADICTED` expanded), `## Verification commands run` (command, exit
  code, banner), and `## Could not verify` (manual/browser items). Pass/fail
  is a closed gate, not advice — per the adversarial-review source in
  [Sources](#sources).

### 4. `doc-writer.md`

```yaml
name: doc-writer
description: >
  Turns a finished plan or a shipped feature into documentation, choosing the
  right destination from docs/README.md's filing table — cross-package flows to
  docs/, package-internal detail to that package's README, lessons to the
  module's LEARNINGS.md — and adding Mermaid diagrams only where a diagram
  beats prose. Writes documentation only; never edits source code. Use after a
  feature lands or when a doc is stale. Does not write agent system prompts
  (docs/agent-prompts/ is the product's own reviewer prompts) and does not
  write specs (that is planner).
tools: Read, Edit, Write, Grep, Glob, Bash, Skill
model: sonnet
```

Tools rationale — `Write`/`Edit` for markdown; `Bash` for `git log`/`git diff`
to see what actually shipped and `ls docs/` to see what exists; `Skill` for
`mermaid-diagram` and `engineering-insights`.

Body outline:

- **Step 0 — clarify what and where.** What shipped or what is stale, and
  whether the ask is a *stable reference doc* or a *living plan/status doc*
  (see Step 2). Vague → ask.
- **Step 1 — the disambiguation, stated up front and unmissably.** Three
  different things called "agent" or "spec" live in this repo, and confusing
  them writes documentation into the wrong file:
  - `docs/agent-prompts/**` — the **product's** DB-backed review-agent
    prompts (`general-reviewer.md`, `security-reviewer.md`,
    `performance-reviewer.md`, `test-quality-reviewer.md`,
    `api-contract-reviewer.md`, `choosing-a-model.md`). They mirror
    `agents.system_prompt` rows and are pushed live via `PUT /agents/:id`
    (`docs/agent-prompts/README.md:7-19`). **`doc-writer` does not edit these**
    — they have their own shipping checklist (`README.md:136-145`) and editing
    one without pushing it desyncs the DB.
  - `.claude/agents/**` — Claude Code tooling subagents (this pipeline).
    `docs/README.md:6-9` has **no row for it**; it is config, not a
    `docs/`-routable subject. Its documentation is
    `.claude/agents/README.md`, in place.
  - `specs/**` vs `e2e/specs/**` — already disambiguated at
    `specs/README.md:7-8` ("Not to be confused with `../e2e/specs/`… a
    different thing entirely"), which is also the precedent for writing this
    kind of warning at all.
- **Step 2 — pick the destination from the table.** `docs/README.md:11-23`,
  reproduced as the routing rule: cross-package flow or multi-package design
  decision → `docs/`; package-internal → that package's `README.md`; lesson
  learned → module `LEARNINGS.md` via `engineering-insights`; feature spec →
  `specs/` (**and that is `planner`'s job, not this agent's**); load-every-
  session material → a `CLAUDE.md`, kept short (root `CLAUDE.md` is the
  worked example of "short"). Plus the genre distinction the table does not
  make: a **living plan/status doc** (`docs/improvement-plan.md:5-8` —
  "Delete this file when the table below is all ✅, not before";
  `docs/pr-self-review-plan.md`) is a different output from a stable
  reference doc (`docs/architecture.md`), with a status table, a last-updated
  date, and a stated deletion condition. Ask which one is wanted if unclear.
- **Step 3 — verify before documenting.** Read the actual code and cite it;
  never document intent from a plan without checking the plan shipped. A doc
  claim is evidence-backed the same way a finding is
  (`researcher.md:64-65,116-118`).
- **Step 4 — diagrams, only when they earn it.** Load `mermaid-diagram`.
  "Diagrams should clarify, not decorate" (`mermaid-diagram/SKILL.md:16`);
  pick the type from the decision table (`SKILL.md:25-37`); cap ~20 nodes,
  split rather than cram (`SKILL.md:238`); use subgraphs and short labels
  (`SKILL.md:230-231`). Match density and style against the two live examples
  — `docs/architecture.md:13` (`flowchart TD`) and `:43` (`sequenceDiagram`).
  External rule to include: if the diagram and the prose say the same thing,
  one of them is redundant; a linear procedure is clearer as a numbered list.
- **Step 5 — update the pointers.** A new `docs/` file needs a row in
  `docs/README.md:6-9`'s table, and possibly a "Read when…" line in root
  `CLAUDE.md`'s Map. A doc nobody links to is a doc nobody reads.
- **Step 6 — `LEARNINGS.md`.** Root `CLAUDE.md`'s closing rule, via
  `engineering-insights`: read first, extend rather than duplicate, write
  nothing if nothing non-obvious came up.
- **What you must not do:** never edit source code (only `.md`); never write
  or edit anything under `docs/agent-prompts/`; never write a spec into
  `specs/` (that is `planner`); never document behaviour it has not read in
  the code; never add a diagram that restates adjacent prose; never exceed
  ~20 nodes; never create a new top-level doc without linking it from
  `docs/README.md`.
- **Output:** files created/updated with the destination rule that chose each
  · diagrams added and why each earned its place · pointers updated
  (`docs/README.md`, `CLAUDE.md`) · anything it could not verify in code and
  therefore did not document.

---

## Skills/conventions each new agent must be designed to route to

*(This section replaces the template's `## Skills for implementer`. The
implementer of this spec writes no product code, so the routing below is
what must appear **inside** the new agent files, not what to load while
creating them.)*

All names below are exact entries in `.claude/skills/` per
`.claude/skills/README.md:9-22`. Anything not on that list does not exist and
must not be named (`planner.md:54-56`).

**`test-writer` — route by path:**

| File being tested | Skills to load | Source |
|---|---|---|
| `client/**/*.test.tsx`, any client component/hook | `react-testing-library` (+ `react-best-practices` when the test exposes a behaviour question) | `pr-self-review/SKILL.md:133` |
| `server/src/modules/**`, `platform/**`, `adapters/**` | `fastify-best-practices` (route/plugin mechanics); `onion-architecture` only to decide where a test double belongs, not to review | `pr-self-review/SKILL.md:134`, `onion-architecture/SKILL.md:10-12` |
| `server/src/db/**` | `drizzle-orm-patterns` (+ `postgresql-table-design` for schema-shaped assertions) | `pr-self-review/SKILL.md:135` |
| `**/contracts/**`, Zod schemas | `zod` | `pr-self-review/SKILL.md:136` |
| `reviewer-core/**` | `typescript-expert` only | `pr-self-review/SKILL.md:137` |

**The gap `test-writer` must state rather than paper over:** there is **no
backend-testing skill** in the catalog. Server-side test *technique* comes
from `TESTING.md` (philosophy `:8-23`, suite map `:27-33`, integration rules
`:46-50`), the existing test files in the module, the mock doubles at
`server/src/adapters/mocks.ts` (`TESTING.md:16-17`), and the DI/port pattern
recorded in `server/LEARNINGS.md` (the local-interface style at
`server/src/modules/reviews/service.ts:1-12`). The agent names these sources
explicitly instead of inventing a skill.

**`architecture-reviewer` — route by path, scope-bounded:**

| Changed path | Skill | Hard boundary |
|---|---|---|
| `server/src/**` | `onion-architecture`, `fastify-best-practices` | `server/src` **only** — excludes `reviewer-core/` and `client/` (`onion-architecture/SKILL.md:10-12`) |
| `client/**` | `frontend-ui-architecture` (+ `next-best-practices` for App Router mechanics) | client **only** (`frontend-ui-architecture/SKILL.md:8-11`) |
| `reviewer-core/**` | `typescript-expert` | `onion-architecture` explicitly excludes it (`pr-self-review/SKILL.md:137`) |
| `client/src/vendor/**`, `server/src/vendor/**` | none | vendored, out of scope for both architecture skills (`pr-self-review/SKILL.md:40-41`) |

Cap at 4 skills and say which were skipped (`pr-self-review/SKILL.md:126-127`).
`security` is deliberately **not** routed here — that is `/security-review`.

**`plan-verifier` — no skills, by design.** It has no `Skill` tool. Its inputs
are the spec, `specs/README.md:20-37` (the shape it reads against), and the
code. Loading a skill would turn it into a code reviewer.

**`doc-writer` — routes to two skills plus a filing table:**

| Task | Skill / rule |
|---|---|
| Any diagram | `mermaid-diagram` (`SKILL.md:16,25-37,230-231,238`) |
| Recording a lesson | `engineering-insights` (root `CLAUDE.md`, "Before you finish") |
| Choosing the destination | not a skill — `docs/README.md:11-23`'s table |
| Describing backend layering in prose | may *read* `onion-architecture` for vocabulary; never applies it as a review |

---

## Verification

No automated suite covers `.claude/agents/`. Each check below is manual and
binary.

**Structural — per new file:**

1. `head -8 <file>` shows exactly four frontmatter keys, in the order
   `name`, `description`, `tools`, `model` — matching `planner.md:1-6`.
   No `when_to_use`, no `version` (those are skill keys,
   `pr-self-review/SKILL.md:1-7`).
2. `name` equals the filename stem.
3. `tools:` is present and non-empty on every file (never omitted — omission
   silently inherits everything, `.claude/agents/README.md:48-49`).
4. `grep -c 'Write\|Edit' <(head -8 architecture-reviewer.md)` → **0**, same
   for `plan-verifier.md`. `plan-verifier.md`'s tool line additionally has
   **no `Skill`**.
5. `test-writer.md` and `doc-writer.md` each list `Skill`, and `Bash`.
6. Every file has a `## Step 0` section, numbered `## Step N` sections after
   it, and closes with `## What you must not do` + `## Output` — or, for the
   two read-only reviewers, `researcher.md:53-74`-style fenced report
   templates in the `## Output` section.

**Capability-backing — the house rule that matters most:**

7. For each prohibition in each file's "What you must not do", either the
   corresponding tool is absent from `tools:` **and the prose names it**
   (`researcher.md:9-10` pattern — "you have no Write or Edit tools"), or the
   file states plainly that the restriction is prose-only. Exactly one
   prohibition in this spec is expected to be prose-only: `test-writer`'s
   "never edit the implementation under test". Any other prose-only
   prohibition is a defect.

**Content fidelity:**

8. Every skill named across the four files appears verbatim in
   `.claude/skills/README.md:9-22`.
   `grep -oh '\b\(onion-architecture\|frontend-ui-architecture\|react-testing-library\|fastify-best-practices\|drizzle-orm-patterns\|postgresql-table-design\|next-best-practices\|react-best-practices\|typescript-expert\|zod\|security\|mermaid-diagram\|pr-self-review\|engineering-insights\)\b' .claude/agents/*.md | sort -u`
   should produce no name outside that list.
9. `test-writer`'s and `architecture-reviewer`'s routing tables agree with
   `pr-self-review/SKILL.md:129-138` for every path both cover; any deviation
   is stated as a deliberate deviation in the file, not left silent.
10. `architecture-reviewer` names
    `server/.dependency-cruiser-known-violations.json` and states that
    `pnpm arch` already subtracts it (`pr-self-review/SKILL.md:100-101`), and
    states that no equivalent gate exists for `client/`.
11. Any package command in any of the four files uses the exact
    `cd /absolute/path || exit 1` + `rc=$?`-on-the-same-line shape
    (`pr-self-review/SKILL.md:70-76`) — no pipes where the status is needed.
12. `doc-writer` contains an explicit `docs/agent-prompts/` vs `.claude/agents/`
    disambiguation, and its "must not" list forbids editing
    `docs/agent-prompts/**`.
13. `plan-verifier` contains an explicit "explicitly out-of-scope items are
    not gaps" rule and a "no generic code-review advice" prohibition.

**README consistency:**

14. `.claude/agents/README.md` catalog has 7 rows; each new row's Tools and
    Model cells match that file's frontmatter character-for-character.
15. The "How they fit together" block no longer contains "not part of this
    pipeline" for architecture review.
16. The Sources section retains every citation currently at
    `.claude/agents/README.md:46-79` and adds the new ones with URLs intact.

**Behavioural smoke tests (one invocation each, cheapest first):**

17. Invoke `plan-verifier` with **no spec path** → it must stop and ask
    (`implementer.md:15-19` pattern), not start reviewing.
18. Invoke `architecture-reviewer` on a diff with zero backend changes → it
    must not run `pnpm arch` ("run what the diff touches",
    `pr-self-review/SKILL.md:48`) and must label client findings as
    judgment, not gate.
19. Invoke `test-writer` on one small existing client component → the report
    must contain a real command, its exit code, and the
    `> @devdigest/web` banner, not a claim of success.
20. Invoke `doc-writer` and ask it to "document the review agents" → the
    correct behaviour is to ask which of the two meanings is intended, not to
    edit `docs/agent-prompts/`.

---

## Sources

Structured after the precedent at `.claude/agents/README.md:39-83`: external
docs plus this repo's own conventions, each cited so a later reader can check
that no rule was invented. External sources were gathered and verified
2026-08-04 by four independent research passes; URLs are reproduced as given.

### External — Anthropic (all four agents)

- *Create custom subagents*, https://code.claude.com/docs/en/sub-agents —
  `tools` "Inherits every tool available to subagents if omitted" (why every
  file here sets it explicitly); "If both are set, `disallowedTools` is
  applied first, then `tools` is resolved against the remaining pool";
  "Subagents receive only this system prompt plus basic environment details…
  not the full Claude Code system prompt" (why each body is self-contained);
  `description` drives automatic delegation, and "To encourage proactive
  delegation, include phrases like 'use proactively'"; built-in
  `Explore`/`Plan` subagents use "read-only tools; Write and Edit are denied"
  — the same capability-absence pattern as `researcher.md:4`; the "Chain
  subagents" pattern ("Use the code-reviewer subagent to find performance
  issues, then use the optimizer subagent to fix them") — the general shape
  the planner→implementer→plan-verifier chain applies. *No Anthropic source
  names a plan-verification stage by that name; treat that mapping as an
  application of the general pattern, not a documented one.*
- *Best practices for Claude Code*, https://code.claude.com/docs/en/best-practices —
  "write a test for foo.py covering the edge case where the user is logged
  out. avoid mocks."; "Have Claude show evidence rather than asserting
  success: the test output, the command it ran and what it returned" (why
  `test-writer`'s Output demands exit codes and banners); "have one Claude
  write tests, then another write code to pass them" — the writer/reviewer
  split behind keeping `test-writer` separate from `implementer`.

### External — `test-writer`

- Tembo.io, *Claude Code Subagents: A 2026 Practical Guide*,
  https://www.tembo.io/blog/claude-code-subagents (2026-05-15) — published
  test-writer example with `tools: Read, Write, Edit, Bash, Glob, Grep`
  (`Bash` because it runs the tests it writes); "Keep the system prompt short.
  Subagents work best with one job and a clear definition of done."
- Skyramp.dev, *Testing AI-Generated Code: Best Practices for 2026*,
  https://skyramp.dev/blog/testing-ai-generated-code (2026-06-23) — "you
  cannot use the same AI system to write code and then test it… shared blind
  spots."

### External — `architecture-reviewer`

- Lukas Niessen, *Fitness Functions: Automating Your Architecture Decisions*,
  https://lukasniessen.com/blog/155-fitness-functions-guide/ — names
  dependency-cruiser alongside ArchUnit / NetArchTest / JDepend as the same
  pattern across ecosystems; architecture conformance belongs in automated,
  CI-integrated checks. Corroborated by the synchronium
  software-architecture-wiki fitness-functions page and Loiane Groner,
  *Architecture Testing for Java with ArchUnit*,
  https://loiane.com/2026/07/architecture-testing-java-archunit/ (2026-07).
  This is exactly what `server/package.json:12`'s `depcruise src
  --ignore-known` already is — hence "deterministic gate first, judgment
  second".
- Luismori.dev, *How to Build a Good Agentic Code Reviewer*,
  https://luismori.dev/article/how-to-build-a-good-agentic-code-reviewer/
  (2026-04-15) — "reject comments that cannot point to concrete evidence in
  the diff or retrieved context… no evidence, no comment"; its comment schema
  requires `evidence: exact file, hunk, or retrieved artifact`.
- Diffray.ai, *LLM Hallucinations in AI Code Review*,
  https://diffray.ai/blog/llm-hallucinations-code-review/ (2025-12-27) —
  reports 29-45% of AI-generated code containing security vulnerabilities and
  ~19.7% of package recommendations pointing to non-existent libraries
  (**single-source figures, cite as such**); combining LLM review with
  deterministic static analysis reported to substantially improve precision.

### External — `plan-verifier`

- ASDLC.io, *Adversarial Code Review*,
  https://asdlc.io/patterns/adversarial-code-review/ (updated 2026-06-30) —
  "Quality Gates (deterministic) — verify syntax, compilation, linting, test
  passage. Review Gates (probabilistic, adversarial) — verify semantic
  correctness, spec compliance, architectural consistency."; "The Critics do
  not generate alternative implementations. They act as gatekeepers,
  producing either PASS or a list of spec violations that must be addressed."
  — the reason `plan-verifier`'s output is a closed PASS/INCOMPLETE gate
  rather than an advisory list.
- Addy Osmani, *How to write a good spec for AI agents*,
  https://addyosmani.com/blog/good-spec/ (2026-01-13) — "After implementing,
  compare the result with the spec and confirm all requirements are met. List
  any spec items that are not addressed."; "Just because the agent produced
  something that passes tests doesn't mean it's correct, secure, or
  maintainable."
- Aqua-cloud, *TOP 11 Best Practices for Requirement Traceability with AI*,
  https://aqua-cloud.io/ai-requirement-traceability/ (updated 2026-04-17) —
  the Requirements Traceability Matrix: map every requirement to a unique
  id/acceptance criterion and to what verifies it; explicitly contrasted with
  "typical peer-review practices that focus on code quality rather than
  requirements completeness."

### External — `doc-writer`

- Mintlify, *Documentation diagrams: when to use them and how to keep them
  accurate*, https://www.mintlify.com/library/when-and-how-to-use-diagrams
  (2026-03-12) — "If your diagram and your prose say the exact same thing,
  one of them is redundant."; diagrams earn their place for auth flows,
  multi-service request/response cycles, state machines and DB relationships,
  not for linear procedures (clearer as numbered lists) or frequently-changing
  UI; "Because the diagram lives as code, it can be version controlled,
  reviewed in pull requests, and updated in the same commit as the related
  code change."
- Docsio, *What Is Docs as Code? A Practical Guide for 2026*,
  https://docsio.co/blog/docs-as-code (2026-04-04) — docs-as-code = the same
  Git/Markdown/PR/CI workflow as software; "When code changes, AI can identify
  which documentation pages need updates and draft the revisions
  automatically", paired with a human-review-before-publish gate. This repo's
  PR review already **is** that gate, so `doc-writer` needs no approval step
  of its own. Independently corroborated by GitBook Blog, *Best AI
  documentation tools in 2026*,
  https://www.gitbook.com/blog/best-ai-documentation-tools (2026-05-25).

### Internal — this repo's own conventions

- `.claude/agents/researcher.md:4,9-10,53-74,111-119` — capability-backed
  prohibition, fenced report template, "never fabricate references", "every
  piece of evidence is tied to a specific file/line/commit".
- `.claude/agents/planner.md:18-32,45-56,78-79,98-116` — the clarify gate,
  exact-skill-names rule, `path:line` citation rule, the
  "must not do" + "Output" closing pair.
- `.claude/agents/implementer.md:15-19,40-44,58-73,75-91` — the hard-stop
  Step 0, the "not an audit, leave it to the dedicated review agents"
  deferrals this spec fills, the per-module command table, the deviation-
  reporting Output contract.
- `.claude/agents/README.md:3-7,19-37,39-83` — frontmatter contract, the
  pipeline diagram this spec rewrites, and the Sources-section precedent.
- `.claude/skills/pr-self-review/SKILL.md:13,28-44,46-57,66-90,100-101,105-119,124-141,143-157,163-176,198-211,213-225`
  — verdict-vs-advisory split, diff resolution and exclusions, the
  deterministic check table, the false-green command shape, the known-debt
  baseline, the skill routing table and its scope note, the repo-specific
  check severities, relocated-code handling, the verify-before-reporting gate,
  the severity rubric.
- `.claude/skills/README.md:9-22` — the only valid skill names.
- `.claude/skills/onion-architecture/SKILL.md:10-12` and
  `.claude/skills/frontend-ui-architecture/SKILL.md:8-11` — the two scope
  boundaries `architecture-reviewer` must not cross.
- `.claude/skills/mermaid-diagram/SKILL.md:16,25-37,230-231,238` — clarify not
  decorate, the type decision table, subgraphs/short labels, the ~20-node cap.
- `.claude/skills/react-testing-library/SKILL.md:10-18` — fewer longer tests,
  behaviour not implementation, mock at boundaries only, each test justifies
  its existence.
- `TESTING.md:8-23,27-33,37-50` — typological not exhaustive, the suite map,
  what each suite covers, `*.it.test.ts` + testcontainers + self-skip.
- `docs/README.md:6-23` — the filing decision table `doc-writer` routes on.
- `docs/agent-prompts/README.md:1-19,136-145` — the product's DB-backed
  reviewer prompts and their push-to-`PUT /agents/:id` shipping rule; the
  thing `doc-writer` must not confuse with `.claude/agents/`.
- `docs/architecture.md:13-22,43-63` — the live `flowchart TD` and
  `sequenceDiagram` examples, and the call path
  (`client hook → api.ts → routes.ts → service.ts → repository.ts → Postgres`).
- `docs/improvement-plan.md:5-8` — the living plan/status doc genre marker
  ("Delete this file when the table below is all ✅, not before").
- `specs/README.md:7-8,10-14,20-37` — the `e2e/specs` disambiguation
  precedent, `NN-slug` numbering, the spec shape.
- `specs/02-review-agent-skills.md:53-84,649-669,730-821` and
  `specs/03-conventions-extractor.md:43-60,288-294` — worked examples of a
  spec's checkable surface, for `plan-verifier`.
- `server/package.json:12-14` — `arch` / `arch:all` / `arch:baseline` scripts;
  `server/.dependency-cruiser-known-violations.json` — the grandfathered
  baseline.
- Root `CLAUDE.md` — module map, the "read the module's `LEARNINGS.md` first"
  rule, and the "Before you finish → `engineering-insights`" closing rule that
  `test-writer` and `doc-writer` inherit.

---

## Before you finish

There is no root `LEARNINGS.md` and this change touches no product module, so
the usual `engineering-insights` step has no obvious target. If creating these
four files surfaces something non-obvious about subagent design in this repo
(e.g. a tool allowlist that behaved differently than expected), record it in
`.claude/agents/README.md` itself rather than inventing a `LEARNINGS.md` where
the repo has none.
