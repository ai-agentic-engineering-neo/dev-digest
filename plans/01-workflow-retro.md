# workflow-retro skill — Implementation Plan

## Source requirements

No `specs/NN-slug.md` exists. Per [`plans/README.md`](README.md) lines 3-5
("for changes small enough to skip that step, after a short direct
clarification"), this plan is written against requirements clarified directly
with the product owner. Summarized:

A new **project-scope Claude Code skill** in `.claude/skills/`, alongside
`implement-plan` and `engineering-insights`, that produces a **retrospective
on how a multi-agent workflow run went** — orchestration performance, not
code lessons.

- **Purpose.** After a workflow run (e.g. an `implement-plan` run, or a
  `spec-creator` → `implementation-planner` back-and-forth like the one that
  produced `specs/09-project-context-folder.md`), collect: total tokens spent
  in the session, how many agents ran, in what order, what each struggled
  with, what went easily, what information got duplicated or re-derived, what
  they missed.
- **Not just analytics.** The output must include concrete, actionable
  recommendations for future runs — not generic advice.
- **Trigger: manual only.** Never automatic. Emphasized twice by the product
  owner; the skill must contain no auto-trigger heuristics and no "run at the
  end of every session" behavior. It runs on explicit invocation only, the
  same as `engineering-insights` and `implement-plan`.
- **Output: both** a summary shown in the conversation **and** a persisted
  ledger file.
- **Ledger location:** `docs/retro/ledger/` (new; confirmed absent —
  `ls docs/retro` → No such file or directory, 2026-08-12).
- **Data source: in-context by default**, meaning derived only from the
  current conversation's own transcript — the orchestrator's own history of
  `Agent`/`SendMessage` calls and the reports they returned, which carry
  `usage: {subagent_tokens, tool_uses, duration_ms}` per finished subagent.
  An optional **deep mode** does a richer pass.
- **Distinct from `engineering-insights`**, which logs code/engineering
  lessons to a module's `LEARNINGS.md`. That split stays.

## Clarifications & recommendations

### Resolved here (decisions this plan makes, stated so the implementer does not re-decide)

**D1 — Skill name stays `workflow-retro`.** No collision in the catalog
(`.claude/skills/README.md:9-23`). "Workflow" already means *agent
orchestration* in this repo's own vocabulary — `.claude/skills/README.md:36`
defines the Agents row's scope as "Workflows … Subagent orchestration".
`orchestration-retro` was considered and rejected: no added clarity over what
the `description` field already does, and it churns the product owner's
working name for nothing. Directory: `.claude/skills/workflow-retro/`.

**D2 — Ledger shape: one file per run**,
`docs/retro/ledger/YYYY-MM-DD-<slug>.md`, written with `Write`, never `Edit`,
and never overwriting an existing path (collision on the same day → append
`-2`, `-3`). Reasoning, since this was flagged genuinely open:

- The product owner named a *directory*, not a filename.
- It is strictly simpler to implement than the append-only pattern.
  `engineering-insights` needs `Edit`-only + anchor-on-heading + read-the-file-
  in-full (`engineering-insights/SKILL.md:7-14`, `examples.md:75-115`) because
  `LEARNINGS.md` is one long-lived shared file where a stray `Write` destroys
  other sessions' work. A per-run file has a unique name, so `Write` carries
  no clobber risk and no anchor can go wrong.
- A retro is a self-contained document with tables of per-phase numbers. Folded
  into one growing file, every future retro would have to read the whole thing
  first — the exact cost this skill exists to measure.
- The one thing a single file gives cheaply is cross-run trend. Recovered
  cheaply instead: the skill lists `docs/retro/ledger/` and reads the
  **Recommendations section of the two most recent entries only**, marking any
  repeat as `RECURRING (Nth run)`. No index file — `ls` is the index, and a
  hand-maintained index is one more thing to drift.

**D3 — Base mode runs inline; only deep mode forks.** Required by the harness
constraint in "Architectural constraints" below. The base skill is a plain
`SKILL.md` the invoking agent follows in its own context, the same shape as
`engineering-insights` and `implement-plan`.

**D4 — Ledger files are committed.** `.gitignore:28-29` ignores only
`.claude/settings*.json`; `docs/**` and `.claude/skills/**` are tracked. So
ledger entries are team-visible artifacts: the skill must forbid pasting raw
prompt text, transcript dumps, secrets, or file contents into them — numbers,
short quotes, and file paths only.

### Recommendations (planner's judgment, not settled requirements)

The product owner's five suggestions, triaged core vs deferred:

| # | Suggestion | Verdict | Why |
|---|---|---|---|
| 1 | Handoff-efficiency signal (fresh `Agent` where `SendMessage` would have resumed) | **Core** | Highest value and cheapest: `implement-plan/SKILL.md:65-75` already states the norm ("Continue the same agent instance … a fresh call throws away the context that agent already gathered"), so this measures compliance against a rule the repo already wrote down. Detectable from the orchestrator's own tool history. Must be reported as a heuristic with the two call sites quoted as evidence, never as a certainty. |
| 2 | Clarification-round count per agent | **Core** | A plain count of stop-and-resume / `AskUserQuestion` round-trips before a finished artifact. Cheap, no inference. |
| 3 | Per-phase token/time breakdown, not just a session total | **Core** | Free — `usage` already arrives per subagent result; grouping is formatting, not analysis. Also the single most decision-changing number in the whole report. |
| 4 | Rework/thrash count on the same artifact | **Core in a reduced form; full version deferred to deep mode** | The transcript-only version (how many times a given output path appears as written/edited across reports in *this* session) is cheap. The full version — reconstructing reversed decisions across rounds — needs git history or raw transcripts, so it belongs in deep mode. |
| 5 | Recommendations must be concrete edits, not generic advice | **Core** | Already a settled requirement; this plan makes it enforceable via a required `Target` field (an exact file path) on every recommendation, plus an `examples.md` showing the pass/fail bar — the same device `engineering-insights/examples.md` uses. |

Further planner recommendations:

- **R6.** Add a one-sentence cross-reference to `workflow-retro` in
  `.claude/agents/README.md`, after the `implement-plan` paragraph
  (lines 33-45), so the skill is discoverable from the pipeline doc it
  reports on. Cheap; folded into scope below.
- **R7.** Do **not** add a `docs/retro/` pointer to root `CLAUDE.md`.
  `docs/README.md:23` says only things an agent should load *every* session
  belong there, "kept short". A manual-only retro skill does not clear that
  bar. Out of scope unless the product owner disagrees.
- **R8.** Do **not** add `references.md` to the skill. `.claude/skills/README.md:44`
  makes it optional, and this skill's rationale is entirely internal (this
  repo's own agent contracts + harness behavior) — that belongs in `README.md`,
  the same place `implement-plan` puts it.
- **R9 (defect found while planning, not part of this feature).**
  `.claude/skills/README.md:3` claims a symlink at `.cursor/skills/ →
  ../.claude/skills`. There is no `.cursor/` directory in this repo (verified
  2026-08-12). Practical effect for this plan: **no symlink step is needed.**
  Fixing or deleting that stale sentence is a separate change; the implementer
  should not silently rewrite it, only note it.

### Open question for the product owner (no answer needed to start)

`docs/README.md:20` currently routes "Lessons learned while working → the
module's `LEARNINGS.md`", which reads as contradicting a retro folder under
`docs/`. This plan resolves it by *narrowing* that line (module/code lessons →
`LEARNINGS.md`; workflow/orchestration retros → `docs/retro/`) rather than
moving the ledger. If the product owner would rather the ledger live outside
`docs/` entirely, that changes only the paths, not the plan's shape.

## Execution mode

**Recommendation: single-agent pass** — one `implementer` run.

Reasoning: five new Markdown files, one `.gitkeep`, and three small edits to
existing Markdown. No module code, no schema, no cross-module contract, no
layering risk — none of the triggers that make this repo's plans go
multi-agent (`server/src` layering, server+client together, anything wanting
an independent conformance check). `architecture-reviewer` has nothing to
review here: its scope is `onion-architecture` on `server/src` and
`frontend-ui-architecture` on the client (`.claude/agents/README.md:18`),
neither of which this touches. `plan-verifier` would add a real but small
amount — the checks in "Verification" below are mechanical enough that the
implementer running them once is sufficient.

**User's confirmed choice: pending.** The planner was asked to make the call
and flag it rather than block. Treat single-agent as the recommendation, not a
confirmed decision; if the product owner prefers, running `implement-plan`
(which adds the `plan-verifier` gate) is harmless — just more tokens than this
change warrants.

## Modules affected

**None of `server` / `client` / `reviewer-core` / `e2e` / `mcp-server`.** This
is repo-tooling only. Stated explicitly because every other plan in this repo
maps to that module list and this one does not.

| Area | Why |
|---|---|
| `.claude/skills/workflow-retro/` | The new skill itself (new directory). |
| `.claude/skills/README.md` | Catalog row — required by the "Catalog" table at lines 5-23. |
| `docs/retro/` | New ledger destination (new directory). |
| `docs/README.md` | Filing-rules table row + the `LEARNINGS.md` narrowing described above. |
| `.claude/agents/README.md` | One-line cross-reference (R6). |

No `package.json`, no TypeScript, no DB, no migration. Nothing in
`server/src/vendor/shared` or `client/src/vendor/shared` — the drift rule in
root `CLAUDE.md:62-69` does not apply.

## Architectural constraints

**Harness-level (not in any `CLAUDE.md` — cite as harness behavior):**

- **A subagent dispatch starts cold.** The `Agent` tool's own documentation
  states a fresh subagent has no access to the invoking conversation. This
  repo restates it independently at `.claude/agents/README.md:80-82`: *"a
  subagent without `fork` starts with no memory of the conversation that
  invoked it, so each file on disk *is* the handoff."* Consequence: a skill
  whose primary data source is the current conversation's own transcript
  **cannot** be implemented as "runs in a subagent and returns a result." Base
  mode must be inline instructions followed by the orchestrating agent.
- **Raw subagent transcripts must never be read inline.** The `Agent` tool's
  instructions for the transcript path it returns: *"Do NOT Read or tail this
  file … it is the full subagent JSONL transcript and reading it will overflow
  your context."* Consequence: deep mode must delegate the read to a forked or
  fresh subagent that returns a bounded digest, and even that subagent must
  extract fields with `Bash` (`jq`/`grep`/`wc`), never `Read` the file whole.

**From this repo's own docs:**

- `.claude/skills/README.md:40-44` — a skill is `SKILL.md` (required),
  `examples.md` (recommended), `references.md` (optional).
- `.claude/skills/README.md:5-23` — every skill has a Catalog row with a Scope
  column; `Project` is the scope used by `pr-self-review`,
  `engineering-insights`, `implement-plan`.
- `.claude/skills/README.md:3` — canonical location is `.claude/skills/`
  (see R9 re: the stale `.cursor` claim).
- `engineering-insights/SKILL.md:9-14` and `examples.md:75-115` — the
  never-`Write`/`Edit`-only/anchor-on-heading discipline. Cited so the
  implementer knows this pattern was **deliberately not copied** (D2), not
  overlooked.
- `implement-plan/SKILL.md:65-75` — `SendMessage`-over-fresh-`Agent`
  continuation; the norm signal #1 measures against.
- `implement-plan/SKILL.md:146-157` — the "What this skill must not do"
  closing section; mirror that shape.
- `implement-plan/SKILL.md:5-6` — frontmatter carrying `version` and
  `user-invocable: true`; `pr-self-review/SKILL.md:5-6` does the same.
  `engineering-insights` omits both (older file) — follow the newer two.
- `docs/README.md:1-5, 13-23` — `docs/` is for cross-package/process material;
  package-internal detail goes to that package's README; session lessons go to
  `LEARNINGS.md`. A workflow retro is process material spanning the whole
  pipeline, so `docs/retro/` qualifies — with the narrowing edit noted above.
- Root `CLAUDE.md:33-37` — `specs/` is the *what and why*, `plans/` the *how*.
  This skill writes neither; its ledger is a third, distinct artifact class.
- Root `CLAUDE.md:39-45` and `:74-79` — no root `LEARNINGS.md`; module lessons
  go to the touched module's own file via `engineering-insights`. The retro
  skill must never write to any `LEARNINGS.md`.
- `.gitignore:28-29` — only `.claude/settings*.json` is ignored, so everything
  this plan creates is committed (D4).

**Planner judgment call, flagged as such:** deep mode's fallback transcript
location, `~/.claude/projects/<cwd-slug>/*.jsonl` (verified to exist on this
machine, 2026-08-12), is machine-local and outside the repo. Reading it may
trigger a permission prompt and it is not portable across machines. The skill
must treat it as a best-effort fallback behind the path the `Agent` tool
actually reported, and degrade to base mode — saying so in the output —
rather than fail.

## Approach

### Files

**New — `.claude/skills/workflow-retro/SKILL.md`** (the skill body).
Frontmatter matching `implement-plan/SKILL.md:1-7`: `name: workflow-retro`,
`description` (leads with *agent-orchestration retrospective*, and states the
`engineering-insights` boundary), `when_to_use` (explicit-invocation phrasings
only — "run a retro", "how did that workflow go", `/workflow-retro`; plus the
`NOT for …` clauses this repo's other skills use, pointing code/engineering
lessons at `engineering-insights`), `version: 1.0.0`,
`user-invocable: true`. Body sections:

1. **Step 0 — confirm manual invocation and scope.** Name the workflow run
   being retro'd (which agents, which artifact it produced). State the mode
   (base, or `--deep`). Refuse to infer a run from a conversation that
   dispatched no agents — say so and stop, rather than emit an empty retro.
2. **Step 1 — reconstruct the timeline (in-context).** Walk the orchestrator's
   own history of `Agent`/`SendMessage` calls in order. For each: agent name,
   dispatch kind (`Agent` = fresh, `SendMessage` = continuation), one-line
   purpose, `subagent_tokens` / `tool_uses` / `duration_ms` from the reported
   `usage` block, and outcome (finished artifact / stop-and-ask / gate verdict).
3. **Step 2 — totals and per-phase breakdown** (recommendation 3). Session
   total plus a per-phase table; flag any phase over ~30% of session tokens or
   disproportionate to its output size.
4. **Step 3 — signals.** Handoff efficiency (1), clarification rounds per
   agent (2), artifact rework/thrash (4, transcript-only form), plus
   duplicated/re-derived information (the same file read or the same fact
   established by two different agents) and misses (something a later phase had
   to discover that an earlier one should have).
5. **Step 4 — recommendations** (5). Every entry carries a `Target` (exact file
   path, e.g. `.claude/skills/implement-plan/SKILL.md`), the concrete change,
   and the signal from Step 3 that justifies it. Generic advice is rejected by
   construction: no `Target`, not a recommendation. Before writing, read the
   Recommendations section of the two most recent `docs/retro/ledger/` entries
   and mark repeats `RECURRING (Nth run)`.
6. **Step 5 — write the ledger + report to chat.** `Write`
   `docs/retro/ledger/YYYY-MM-DD-<slug>.md` (never overwrite; disambiguate with
   `-2`), then show a short summary in the conversation: totals, agent order,
   the top 2-3 recommendations. Both outputs, per requirements.
7. **Deep mode (`--deep`, optional).** Same steps, plus: dispatch one
   subagent (`researcher` — read-only, `Read/Grep/Glob/Bash`,
   `.claude/agents/README.md:13`) per transcript of interest, with an explicit
   instruction to extract via `jq`/`grep` and return a digest under a stated
   line budget, and an explicit prohibition on `Read`-ing the JSONL whole.
   Never read those files in the orchestrator's own context.
8. **What this skill must not do** (mirroring `implement-plan/SKILL.md:146-157`):
   never run automatically or suggest an automatic trigger; never write to any
   `LEARNINGS.md` (that is `engineering-insights`); never write to `specs/` or
   `plans/`; never review code quality; never invent token numbers — a phase
   with no reported `usage` is marked `not reported`, never estimated; never
   paste raw transcript text, prompts, secrets, or file contents into the
   ledger; never overwrite an existing ledger file.

**New — `.claude/skills/workflow-retro/README.md`** (design rationale, the
pattern `implement-plan/README.md` establishes): why base mode is inline and
only deep mode forks (the two harness constraints); why per-run files rather
than one append-only ledger (D2), explicitly contrasting
`engineering-insights`'s `LEARNINGS.md` discipline and why it does not
transfer; why manual-only; why this is separate from `engineering-insights`;
and a "Not built yet / open questions" section — unproven on a real run, the
deep-mode transcript path is machine-local, the recurring-recommendation
lookback depth (2) is a guess.

**New — `.claude/skills/workflow-retro/examples.md`**: the pass/fail bar for a
recommendation, in `engineering-insights/examples.md`'s style — ❌ "improve
agent handoffs" / ✅ "`Target: .claude/skills/implement-plan/SKILL.md` — add a
line under 'Relaying blocking stops' reminding the orchestrator that a fix-loop
re-dispatch after `plan-verifier` INCOMPLETE should use `SendMessage`, because
run 2026-08-12 spent 18k tokens re-deriving context a fresh `implementer` had
already gathered." Plus one short worked ledger excerpt showing the timeline
table's columns.

**New — `docs/retro/README.md`**: what the folder holds, how it differs from
`specs/`, `plans/`, and module `LEARNINGS.md`, the file-naming rule, and the
"no raw transcripts, prompts, or secrets" rule (D4).

**New — `docs/retro/ledger/.gitkeep`**: git does not track empty directories;
without it the ledger path does not exist until the first retro run.

**Edit — `.claude/skills/README.md`**: one Catalog row after the
`implement-plan` row (line 23), scope `Project`, phrased to make the boundary
with `engineering-insights` visible at a glance.

**Edit — `docs/README.md`**: add a `retro/` row to the table (lines 6-9) with
its "Read when"; narrow the "What does not" bullet at line 20 to
module/code lessons, so it no longer reads as excluding this folder.

**Also add — disambiguation between `plans/` and `docs/*-plan.md`.** Raised by
the product owner while reviewing this plan: `docs/improvement-plan.md` and
`docs/pr-self-review-plan.md` predate the `plans/` convention and are a
different genre — living audit/backlog trackers and a build-log-that-grew,
not pre-code "how" documents — but the shared word "plan" invites confusion.
Add one bullet to the "What does not" section: pre-code implementation plans
belong in `../plans/` (written before code, by `implementation-planner`); the
two existing `docs/*-plan.md` files are living audit/status trackers, not
implementation plans, and are not being migrated or renamed as part of this
change — that's a separate, explicitly out-of-scope cleanup the product owner
deferred. Do not touch `improvement-plan.md` or `pr-self-review-plan.md`
themselves.

**Edit — `.claude/agents/README.md`**: one sentence after the `implement-plan`
paragraph (lines 33-45) cross-referencing the skill (R6). `SKILL.md` links back
to `../../agents/README.md`, matching `implement-plan/SKILL.md:11-13`.

### Not in scope

No changes to `implement-plan`, to any agent contract, or to root `CLAUDE.md`
(R7). Recommendations this skill later produces may propose such edits — that
is output, applied deliberately by a human, not part of building it.

## Skills for implementer

**Routing gap, stated per contract:** `pr-self-review/SKILL.md`'s Phase 3
table (lines 129-138) routes only `client/**`, `server/**`,
`reviewer-core/**`, `**/contracts/**`, and "any `.ts`/`.tsx`". It has **no row
for `.claude/**` or `docs/**`**, which is every file this plan touches. No
skill in `.claude/skills/README.md`'s catalog governs Markdown authoring or
skill authoring. So:

| Path glob | Skill to load | Why |
|---|---|---|
| `.claude/skills/workflow-retro/**`, `docs/retro/**`, `docs/README.md`, `.claude/skills/README.md`, `.claude/agents/README.md` | **None applies** | Not covered by the Phase 3 routing table; no catalog skill covers Markdown/skill authoring. Do not substitute an unrelated skill to fill the row. |
| Any file, if a diagram is added | `mermaid-diagram` | Only if the implementer judges a diagram earns its place. **Planner recommendation: skip it** — the ledger's content is tables and counts; a diagram would be decoration. |

Instead of a skill, the implementer's conventions source for this change is the
three files this plan cites throughout — `.claude/skills/implement-plan/SKILL.md`,
`.claude/skills/implement-plan/README.md`, and
`.claude/skills/engineering-insights/SKILL.md` + `examples.md`. **Read all four
before drafting**; house style (frontmatter shape, the "must not do" closing
section, the rationale-in-README split) comes from them, not from memory.

Root `CLAUDE.md:74-79` asks for an `engineering-insights` pass before
finishing. Note that there is no root `LEARNINGS.md` (`CLAUDE.md:39-41`) and
this change touches no module, so there is no correct destination file —
skip it unless a non-obvious discovery surfaces that belongs to a module, in
which case say which module and why.

## Verification

**No `pnpm test` / `pnpm typecheck` run applies.** This change adds no
TypeScript and touches no package — a suite run here would verify nothing
about the diff. `pr-self-review` re-runs the full suite before push regardless.

Scoped checks, all from the repo root:

1. **Frontmatter is well-formed and matches its siblings.**
   `head -8 .claude/skills/workflow-retro/SKILL.md` — expect an opening and
   closing `---`, and the five keys `name`, `description`, `when_to_use`,
   `version`, `user-invocable`, in the same order as
   `.claude/skills/implement-plan/SKILL.md:1-7`. `name` must equal the
   directory name (`workflow-retro`).
2. **No auto-trigger language.**
   `grep -niE "automatic|every session|at the end of every|proactively|auto-run" .claude/skills/workflow-retro/SKILL.md`
   — expect either no hits, or hits only inside sentences that *forbid* the
   behavior. Any hit that reads as an instruction to self-trigger is a failure;
   the manual-only requirement was stated twice.
3. **The two prohibitions are present verbatim in intent.**
   `grep -n "LEARNINGS" .claude/skills/workflow-retro/SKILL.md` — expect the
   "never writes to any `LEARNINGS.md`" boundary. `grep -n "JSONL\|transcript" …`
   — expect the deep-mode prohibition on reading raw transcripts inline.
4. **Every relative link resolves.** For each `](…)` target in the four new
   Markdown files and the three edited ones, confirm the path exists (e.g.
   `test -e` per link, run from the linking file's directory). Expect zero
   missing targets. `SKILL.md`'s link to `../../agents/README.md` and
   `README.md` are the ones most likely to be wrong.
5. **Catalog and filing-rule rows landed.**
   `grep -n "workflow-retro" .claude/skills/README.md docs/README.md .claude/agents/README.md`
   — expect exactly one hit in each (the catalog row, the `retro/` row, the
   cross-reference). Also `grep -n "plans/" docs/README.md` — expect the new
   disambiguation bullet, and confirm `improvement-plan.md` /
   `pr-self-review-plan.md` are untouched (`git diff --stat` shows no entry
   for either).
6. **Ledger path exists and is tracked.**
   `git status --porcelain docs/retro` — expect
   `docs/retro/README.md` and `docs/retro/ledger/.gitkeep` as new files. No
   ledger entry is created by the implementation itself; the directory ships
   empty by design.
7. **No pre-existing file was rewritten.**
   `git diff --stat .claude/skills/README.md docs/README.md .claude/agents/README.md`
   — expect small line counts (roughly ≤ 3 added, ≤ 2 changed per file). A
   large diff on any of the three means something was reflowed that should not
   have been, including the stale `.cursor` sentence at
   `.claude/skills/README.md:3` (R9), which must be left exactly as-is.

**Acceptance beyond the implementer's reach:** the skill's real test is one
manual `/workflow-retro` invocation in a conversation that actually ran agents,
checking that the ledger file appears and the recommendations carry `Target`
paths. That is a human step after this plan lands, not a command the
implementer can run.
