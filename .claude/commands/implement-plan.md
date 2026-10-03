---
description: Build a saved implementation plan end to end — implementors, one full verify, coverage check, review + tests, fix loop, final gates
argument-hint: <docs/plans/YYYY-MM-DD-slug.md>
---

Orchestrate the build of the plan at `$ARGUMENTS`. You are the orchestrating
session: you delegate and aggregate, you don't write product code yourself.
Read the plan, and the spec named in its `Requirements source:` line. If the
spec's `Status:` is not `approved`, stop and ask the user before building.

Keep every subagent prompt self-contained (the step text, its `Covers:` IDs and
the spec path) — subagents don't see this conversation. Keep their reports out
of your replies to the user except for the summaries asked for below.

## 1. Implement

Follow the plan's **Execution guidance**.

- **Multi-agent**: launch one `implementor` per step, batches of ≤4 in a single
  message, `isolation: "worktree"` only where the plan asks for it. A batch
  starts only after the steps it depends on have landed (worktrees merged).
- **Single-agent**: one `implementor` per step, in plan order.
- Hand each implementor its step verbatim. Don't add skills it didn't list.
- A report with `Status: blocked` stops that branch: resolve it with the user,
  then relaunch the step. Never widen a step's file scope to unblock it.

## 2. Verify once

For each touched package: `scripts/verify.sh <pkg> --full`. Integration tests
need Docker; if they show `SKIP`, say so in the final report. A red gate goes
back to the `implementor` whose step owns the failing file (that counts as a
fix-loop iteration, see 5).

## 3. Coverage check (pre-review)

Run the `plan-verifier` skill with `<spec path> $ARGUMENTS pre-review`.
`missing` / `partially covered` rows go back to the owning step's implementor
before anyone reviews or tests. `not verifiable as written` → ask the user.

## 4. Review and tests — in parallel, one message

- `architecture-reviewer` on the branch diff.
- `/code-review` (correctness bugs; architecture-reviewer doesn't look for them).
- `security` skill, only when the spec's *Untrusted inputs* is not "none" or
  it has a Security NFR.
- `test-writer`, one instance per package (or per Coverage-table group), given
  the AC-N statements with their `observable:` hints and the plan's
  "Planned test" rows — not the implementation files.

## 5. Fix loop — at most 2 iterations

Collect High/Medium findings plus red tests where test-writer reported an
expectation/implementation mismatch. Hand them to `implementor`, grouped by
plan step / file scope. Then re-run `scripts/verify.sh <pkg>` on the files
touched. Low-confidence findings go to the user as a list, unfixed. After 2
iterations with anything still open, stop and hand the rest to the user —
don't keep looping.

## 6. Final coverage

`plan-verifier` with `<spec path> $ARGUMENTS final`. Every AC-N should be
`covered`; `covered-untested` goes back to test-writer once. Then fill the
spec's Traceability table (Task, Test) from the verifier's table and the plan's
Coverage table.

## 7. Close

1. `scripts/verify.sh <pkg> --full` once more if step 5 or 6 changed code.
2. `pr-self-review`.
3. Commit only if the user asks; then fill the Commit column.
4. `engineering-insights` for every module touched.
5. Ask the user before setting the spec's `Status: implemented`.

Final reply: per-step status, the gates (PASS/FAIL/SKIP), the final
plan-verifier summary line, open findings for the user, and anything skipped.
