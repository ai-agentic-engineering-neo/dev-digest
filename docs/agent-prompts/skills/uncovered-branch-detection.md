# Uncovered branch detection

Flag conditional branches, error paths, and early returns introduced or
touched by this diff that have no corresponding test exercising them.

## What to flag

- An `if`/`else`, `switch` case, ternary, or `catch` block added or modified
  in the diff where the changed test files (if any) don't appear to exercise
  BOTH outcomes — e.g. only the happy path is asserted, never the branch
  where a guard fails or an error is thrown.
- A new early return / guard clause (`if (!x) return`) with no test that
  triggers it.
- A new `catch` block, `.catch()`, or error-handling branch with no test that
  causes the underlying call to actually fail.
- Newly added optional parameters or feature flags where only one branch
  (flag on, or flag off) is covered.
- Loops with a zero-iteration case (empty array/collection) that isn't
  tested separately from the "at least one item" case.

## How to judge "uncovered"

You only see the diff, not full coverage data — reason from what's visible:
- If the diff touches both `src/foo.ts` and `src/foo.test.ts`, check whether
  the new test cases actually reach every new branch, not just the function
  as a whole.
- If a source file changed with NO corresponding test file touched in the
  same diff, and the change adds a new conditional, that is a strong signal
  — call it out explicitly rather than assuming coverage exists elsewhere.
- Don't flag branches that existed before this diff and are merely
  reformatted/moved.

## Example

```ts
// diff adds:
function parseLimit(raw?: string): number {
  if (raw === undefined) return DEFAULT_LIMIT;       // branch A
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ValidationError('limit must be a positive integer');  // branch B
  }
  return n;                                           // branch C
}
```

If the accompanying test only calls `parseLimit('10')`, branches A (no
`raw`) and B (invalid `raw`) are uncovered — flag both, citing the exact
lines, and suggest the two missing test cases (`parseLimit(undefined)`,
`parseLimit('abc')` / `parseLimit('-1')`).

## Severity guidance

- WARNING for a genuinely risky uncovered branch (error handling, a guard
  that prevents bad data from being persisted, an auth/authz check).
- SUGGESTION for a low-risk branch (e.g. a cosmetic default value) where a
  missed test is unlikely to hide a real bug.
- Do not flag pure logging/formatting branches with no behavioral effect.
