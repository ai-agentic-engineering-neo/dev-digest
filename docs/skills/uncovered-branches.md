---
name: uncovered-branches
description: Use on every PR that changes production logic together with tests. Flag each new or changed branch (if/else, switch case, early return, catch, ternary, `??`/`||` fallback) that no test in the diff drives.
type: rubric
---
# Uncovered branches

For every production function changed in the diff:

1. List its branches: each `if` / `else if` / `else`, each `switch` case and the
   `default`, each early `return` / `throw`, each `catch`, each ternary, each
   `??` / `||` / `&&` fallback that changes the result.
2. For each branch, find a test in the diff whose inputs actually reach it.
   Read the arrange/act part of the test — the test name does not count.
3. A branch with no test reaching it is a finding. Cite the production line of
   the branch, not the test file.

Report:
- WARNING — a changed or new branch that no test reaches.
- CRITICAL — the unreached branch handles money, auth, deletion or persisted
  state, AND the PR's tests only cover the happy path of that function.

Suggestion format: name the test to add — "add a test where `<input>` so that
`<condition>` is true and assert `<expected result>`".

Do not flag: logging-only branches, unreachable defensive `default` cases that
only throw "unreachable", or branches in files with no tests in the repo at all
(that is a missing test file, not an uncovered branch).
