---
name: implement-plan
description: "Runs implementer → plan-verifier (gate) → architecture-reviewer (with an auto-fix loop) for an existing plans/NN-slug.md, checkpointing after implementation and capping architecture fix rounds. Does not run spec-creator, implementation-planner, or test-writer."
when_to_use: "When you already have a plans/NN-slug.md (written by hand or by implementation-planner, run separately) and want implementer + the plan-verifier gate + an architecture-review fix loop in one command, instead of invoking each agent by hand and manually re-running architecture-reviewer after every fix. NOT for turning an idea into a spec (spec-creator) or a spec into a plan (implementation-planner) — run those yourself first. NOT a replacement for /pr-self-review — run that separately, right before push. Does not write tests — that's test-writer, invoked separately, by design, for now."
version: 2.0.0
user-invocable: true
---

# Implement Plan

One command over three agents from this repo's pipeline
([`.claude/agents/README.md`](../../agents/README.md)):
`implementer → plan-verifier (gate) → architecture-reviewer (fix loop)`.

Design rationale: [README.md](README.md).

**Deliberately out of scope:**

- `spec-creator` and `implementation-planner` — run these yourself, by hand,
  before invoking this skill. This skill starts from a plan that already
  exists; it never turns an idea into a spec or a spec into a plan.
- `test-writer` — skipped for now to save tokens. Run it yourself, by hand,
  once the implementation and architecture review have settled. See
  [README.md](README.md) for how to bring it back once cost isn't the
  binding constraint.
- `/pr-self-review` and `doc-writer` — still separate, deliberate steps
  after this skill finishes; it points you at both rather than running them.

## Step 0 — get the plan

Require a `plans/NN-slug.md` path. If you weren't given one, stop and ask
for it — do not infer a plan from a vague request or from reading source
code; that's `implementation-planner`'s job, not this skill's. Confirm the
file exists (`Read`) before proceeding.

State the plan path and, from its own "Modules affected" section, which
modules this run will touch, before doing anything else.

## The two policies this run follows

**Checkpoint after implementation, by default.** Once Phase 1
(`implementer`) finishes, stop, show a short summary of files changed, and
ask via `AskUserQuestion`: continue to the gate, stop here, or adjust
(feed a correction back to the same agent via `SendMessage`). Skip this
checkpoint only when the invocation says `--auto`.

**Conservative auto-fix in Phase 3.** Only a `CONFIRMED` `CRITICAL`/`HIGH`
`architecture-reviewer` finding triggers an automatic fix round through
`implementer`, capped at 2 rounds. `PLAUSIBLE` findings and anything
`MEDIUM` are reported, never auto-fixed — ask the user via
`AskUserQuestion` whether to fix, accept as known debt, or ignore each one
still open after the rounds.

## Relaying blocking stops

`implementer` stops mid-run and reports rather than guessing when: the plan
is ambiguous on something it needs, or it discovers the plan needs something
outside its stated scope. `plan-verifier` stops if either the plan path or
the implementation reference is missing — shouldn't happen here since Step 0
already confirmed the plan, but treat it the same way if it does. Neither
agent has `AskUserQuestion` in its own tool list — a stop can only appear in
the agent's report text.

When an agent's report is a stop rather than a finished result:

1. Extract the exact question or gap as the agent phrased it.
2. Ask the user via `AskUserQuestion`.
3. **Continue the same agent instance** (`SendMessage` to it) with the
   answer, instead of starting a fresh one — a fresh call throws away the
   context that agent already gathered.
4. Repeat until the report is a finished artifact or verdict, not a further
   stop.

This applies regardless of `--auto` — these are the agents' own contracts,
not this skill's checkpoint.

## Phase 1 — implementer

Invoke `implementer` with the plan path from Step 0. A mid-run scope-gap
report is a hard stop regardless of `--auto` — ask the user: tell
`implementer` to proceed with an explicit scope note, or stop the run here
and let the user go fix the plan themselves (via `implementation-planner`,
run by hand — out of this skill's scope).

When it finishes, read the report: files changed by module, and its own
test/typecheck self-check results — this is `implementer`'s own check, not
the pipeline's gate; that's Phase 2.

Checkpoint (unless `--auto`): show files changed, ask to continue.

## Phase 2 — plan-verifier (the gate)

Invoke `plan-verifier` with the plan path and "working tree" (or the branch,
if the user named one) as the implementation reference.

- `PASS` → proceed to Phase 3.
- `INCOMPLETE` → fix loop, capped at 2 rounds: dispatch `implementer` again
  with the plan path plus the specific Gaps list from the report, phrased as
  what to complete — the same plan, named gaps, not a new one. Re-run
  `plan-verifier`. Still `INCOMPLETE` after 2 rounds → stop and hand the
  user the Gaps table. Do not proceed to Phase 3 against code the gate
  hasn't passed.

This phase always runs, `--auto` or not — it's the deterministic gate the
rest of the pipeline depends on, not an extra checkpoint this skill adds.
`plan-verifier` currently runs on `sonnet`, which has no deterministic
backstop of its own — if its verdicts start looking wrong in practice
(missed gaps a manual look catches later), say so; that's a signal to move
it back to `opus` in `.claude/agents/plan-verifier.md`, not something this
skill can self-correct.

## Phase 3 — architecture-reviewer, with fix loop

Invoke `architecture-reviewer` against the diff `plan-verifier` just passed.

Apply the fix-loop policy: collect every `CONFIRMED` `CRITICAL`/`HIGH`
finding into a fix list; dispatch `implementer` once per round with the plan
path plus that list, phrased as "additionally address these architecture
findings, staying strictly scoped to them" — pass this as plan *text*
alongside the plan path (`implementer` accepts plan text inline per its own
contract, so this doesn't require writing a new plan file). Re-run
`architecture-reviewer` after each round. Cap at 2 rounds.

After the cap — or immediately, for `PLAUSIBLE`/`MEDIUM` findings — surface
whatever remains via `AskUserQuestion`: fix manually, accept as known debt
(note: this skill does not itself edit
`server/.dependency-cruiser-known-violations.json` — that's a deliberate,
separate act, not a side effect of "accept"), or ignore for this run.

## Phase 4 — wrap-up

Report, not a checkpoint:

- Plan path.
- Files changed, by module.
- `plan-verifier`'s final verdict.
- `architecture-reviewer`'s final state: clean, or accepted findings and who
  accepted them.
- Explicit next steps, none of which this skill ran:
  - **`test-writer`** — no coverage was added by this run; invoke it
    yourself when ready.
  - **`/pr-self-review`** — the actual pre-push gate; run it before opening
    a PR.
  - **`doc-writer`** — only if the feature is documentable and shipped.

## What this skill must not do

- Never invoke `spec-creator`, `implementation-planner`, or `test-writer` —
  out of scope by design, not an oversight.
- Never infer a plan from a vague request — Step 0 requires an actual
  `plans/NN-slug.md` path.
- Never fabricate an agent's report — every phase transition is gated on
  that agent actually returning a finished artifact or verdict, never on an
  assumption of what it probably said.
- Never skip Phase 2, regardless of `--auto`.
- Never treat this skill's completion as equivalent to `/pr-self-review`, or
  as having added test coverage — say both explicitly in Phase 4.
