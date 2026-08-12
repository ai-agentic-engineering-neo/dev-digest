# implement-plan — design rationale

Three agents from `.claude/agents/README.md`'s pipeline, run in one command:
`implementer → plan-verifier (gate) → architecture-reviewer (fix loop)`.

Formerly `spec-driven-feature` (2026-08-12), which also ran `spec-creator`
and `implementation-planner` at the front and `test-writer` at the back.
Narrowed to this three-agent core for two independent reasons, not one:

## Why spec-creator and implementation-planner are out

Both are run manually now, by design — not a temporary cut. The judgment
each does (clarifying scope, choosing single- vs multi-agent execution) is
exactly the kind of decision this repo's own agent contracts treat as a
mandatory human checkpoint (`implementation-planner.md`: "never skip this
question, even when your recommendation feels obvious"). Folding them into
an orchestrator that also checkpoints risked producing two nested
checkpoint experiences instead of one clean one. Keeping them manual means:
by the time this skill is invoked, the plan already reflects a decision the
user made deliberately, not one relayed through this skill's own
checkpoint UI.

## Why test-writer is out (for now)

Pure cost. `test-writer` runs a full test suite at least once
(`test-writer.md` Step 5) and can trigger its own fix-round if it surfaces a
suspected bug — real tokens on `sonnet`, but still a cost the current budget
doesn't want spent automatically on every run. This is reversible: to bring
it back, add a Phase 5 mirroring the old `spec-driven-feature` design (invoke
`test-writer` against the stable diff after Phase 3 settles, same fix-loop
shape capped at 2 rounds) — but only once cost is no longer the binding
constraint, and probably behind an explicit `--with-tests` flag rather than
back in the default path, so the cost-conscious default doesn't regress
silently.

## Why architecture-reviewer and plan-verifier moved to sonnet

Also cost — `opus` on a gate that can run 2-3 times per feature (once
per fix-loop round) multiplies fast. The two agents carry different risk
from the downgrade:

- **`architecture-reviewer`** — its backend check runs `pnpm arch`, a
  deterministic command independent of model quality. The model's job is
  mostly to interpret that result and handle frontend findings, which the
  agent's own contract already labels judgment-only, not a machine result.
  Low risk.
- **`plan-verifier`** — no deterministic backstop of its own. Its entire
  output (`DONE`/`PARTIAL`/`MISSING`/`CONTRADICTED` per plan item) is model
  judgment matching claims to file:line evidence, and it's the one gate the
  rest of the pipeline trusts before spending more tokens. A wrong verdict
  here defeats the reason it runs first. Moved to `sonnet` as an experiment,
  not a settled call — watch its first several real verdicts; move back to
  `opus` in `.claude/agents/plan-verifier.md` if it starts producing a
  `PASS` that a later manual look or `architecture-reviewer` run
  contradicts.

## Why Phase 2 (plan-verifier) always runs, even with `--auto`

It's the one deterministic PASS/INCOMPLETE gate in the pipeline
(`plan-verifier.md`'s own design note: "a closed gate, not advice"). `--auto`
removes this skill's *own* checkpoint after Phase 1 — it was never meant to
remove a gate the underlying agent is itself built to be.

## Why the fix-loop is conservative by default

Mirrors `pr-self-review`'s own stated reasoning: "Advisory findings never
block, including HIGH... A gate that fires on every PR gets bypassed on
every PR." Auto-fixing low-confidence (`PLAUSIBLE`) or low-severity
(`MEDIUM`) findings spends `implementer` rounds on things that may be style,
not defects — capping auto-fix to `CONFIRMED` `CRITICAL`/`HIGH` keeps every
automatic action trustworthy, and keeps token spend concentrated on findings
worth fixing without a human looking first.

## Fix-list dispatch uses plan text, not a new plan file

`implementer`'s own contract accepts "A `plans/NN-slug.md` path (or the plan
text)" as input. Passing a fix list as inline text alongside the original
plan path keeps every fix-loop dispatch inside `implementer`'s actual
contract, without minting a new numbered file in `plans/` for what is really
an addendum to the same plan.

## Not built yet / open questions

- **Unproven.** No feature has gone through this skill (under either name)
  yet — `plans/` is still otherwise empty (as of 2026-08-12). Treat the
  first few real runs as validating the design, including the `sonnet`
  swaps above, not just the feature they happen to build.
- **`sonnet` on `plan-verifier` is the riskiest single change here** — see
  above. If it needs reverting, that's a one-line frontmatter change in
  `.claude/agents/plan-verifier.md`, not a change to this skill.
- **`SendMessage`-based agent continuation** for relaying blocking stops
  hasn't been exercised in anger by this skill. Fallback: re-invoke the
  agent fresh with the original input plus the user's answer folded into
  the prompt text.
- **Fix-loop cap (2 rounds)** is a starting guess, not a measured number —
  revisit once real runs show whether findings typically converge in 1-2
  rounds or routinely need more.
