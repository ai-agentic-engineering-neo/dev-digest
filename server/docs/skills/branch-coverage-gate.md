---
name: branch-coverage-gate
description: Flag any changed function with an untested conditional branch.
type: rubric
---

# Branch Coverage Gate

Every function this diff adds or changes has a set of branches: if/else,
switch/case, ternaries, early returns, catch blocks, and short-circuit
fallbacks (?? and ||). Your job is to enumerate those branches from the diff
alone, then check whether the accompanying test — in this PR or already in
the repo — actually drives each one to a distinguishable outcome. A branch
counts as "tested" only when some assertion would fail if that branch's body
were deleted or inverted; a test that merely calls the function and checks it
does not throw does not count.

## How to find an untested branch

1. Read the changed function top to bottom and list every point where control
   flow forks. Early returns and guard clauses count as branches even when
   there is no matching else.
2. For each branch, ask: does a test in this diff supply an input that takes
   this specific path, and does it assert on an outcome specific to that path
   (a return value, a thrown error, a side effect)? If the answer is "the
   existing happy-path test happens to also execute this branch but asserts
   on something unrelated," treat it as untested.
3. Pay special attention to branches added alongside an existing, already
   well-tested function — these are the easiest to miss because the function
   "already has tests." The new branch needs its own case, not credit
   borrowed from the old ones.
4. Error-handling branches (catch blocks, validation failures, early
   rejections) are the most commonly skipped. If a function gained a new
   failure mode, look for a test that triggers that specific failure.

## What to report

State the exact branch (file:line) and, if you can identify it, the file:line
of the test file that covers the function but misses this path. Describe
concretely what could go wrong: what value would the function wrongly return,
or what side effect would wrongly happen or not happen, if this branch were
buggy — a bug that ships silently because nothing exercises the path. Do not
flag a branch as untested if it is trivially unreachable in practice (e.g. a
defensive check against a type the caller cannot produce) or if the diff's
own reasoning shows the branch is exhaustively covered by a table-driven test
you can see in the diff.

## Severity guidance

A money-, auth-, or tenancy-relevant branch with no test is a blocker-grade
finding. An untested branch in a low-stakes helper is a lower-severity note —
still worth raising, but not something that should stop the merge on its own.
