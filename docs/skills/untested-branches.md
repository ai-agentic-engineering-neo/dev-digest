---
name: untested-branches
description: Apply when a diff adds or changes production logic with conditionals; check that every new or changed branch (if/else, switch case, early return, catch, ternary, default argument) is exercised by a test.
type: rubric
---
# Untested branches

## Procedure
1. List the production (non-test) files in the diff. Ignore pure type, config and
   re-export changes.
2. In each changed hunk, enumerate every branch the change adds or modifies:
   - `if` / `else if` / `else` arms and guard clauses
   - `switch` cases, including `default`
   - early `return` / `throw` / `continue`
   - `catch` and `finally` blocks
   - ternaries, `??`, `||`, `&&` short-circuits that choose between behaviours
   - default argument values and optional-chaining fallbacks
3. For each branch, look for a test in the diff (or in visible context) that reaches
   it with an input that selects that branch and asserts the outcome.
4. Ask the deletion question: if this branch were removed or inverted, would any
   test fail? If not, the branch is unprotected.

## What counts as covered
- A test whose input forces the branch AND whose assertion depends on what the
  branch does.
- Not covered: a test that runs the function but only asserts the happy-path result;
  a test that reaches the branch but asserts nothing about its effect.

## How to report
- Put the finding on the production line of the branch (a line in the diff).
- Name the branch: "the `catch` that maps a GitHub 404 to `NotFoundError`".
- Name the missing test: the input that reaches it and the expected outcome, e.g.
  "add a test where the repo lookup returns null and expect a 404".
- One finding per distinct unprotected branch; group sibling branches of the same
  switch into one finding.

## Severity guidance
- WARNING: an untested branch in ordinary logic.
- CRITICAL: only when the branch guards auth, tenant scoping, data deletion,
  money or contract validation and nothing else in the diff would catch a
  regression.
- SUGGESTION: an unreachable-in-practice defensive branch.

## Do not flag
- Branches in test files, generated code or migrations.
- Pre-existing branches the diff does not touch.
- Trivial branches whose both arms are covered by type checking.
