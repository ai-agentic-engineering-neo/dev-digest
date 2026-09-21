# Missed corner cases

Flag test suites (new or modified in this diff) that only exercise the
"normal" input and skip the boundary/degenerate inputs that commonly hide
bugs.

## What to flag

- **Empty / null / undefined inputs**: an empty string, empty array, empty
  object, `null`, or `undefined` passed where the function accepts one, with
  no test for that case.
- **Boundary values**: `0`, `-1`, the exact upper/lower limit of a range,
  `Number.MAX_SAFE_INTEGER`, an off-by-one at a pagination/limit edge.
- **Duplicate / repeated input**: the same id appearing twice in a batch
  call, duplicate keys in an object built from user input.
- **Unicode / encoding edges**: multi-byte characters, emoji, very long
  strings, strings containing the delimiter/separator the code itself uses
  (e.g. a comma in CSV-like parsing).
- **Concurrent / out-of-order edges**: for anything async, the case where a
  second call arrives before the first resolves, or a cancelled/aborted
  request.
- **Type-adjacent falsy traps**: `0`, `''`, `false` treated as "missing" by
  a `||` check when `??` was needed, or an empty array (which is truthy)
  treated as "no items" without an explicit `.length === 0` check.

## How to judge

- Read the new/changed test file's `describe`/`it` blocks (or equivalent)
  and list which corner cases they actually assert vs. which corner cases
  the changed source code's logic implies exist.
- Prioritize corner cases that are NEW because of this diff (a newly added
  parameter, a newly added loop, a newly widened accepted type) — don't
  demand exhaustive coverage of pre-existing code the diff didn't touch.
- A corner case only matters if the source code's behavior at that input is
  not obviously identical to the happy path — if the function is already
  provably total and correct at the boundary (e.g. Postgres enforces the
  constraint), don't manufacture a finding for its own sake.

## Example

```ts
// diff adds:
export function splitBatches<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
```

Tests should cover: `items = []` (expect `[]`, not `[[]]`), `size` larger
than `items.length` (one batch), `size <= 0` (infinite loop / no progress —
this is actually a bug, not just a missing test, if unguarded). If only the
"3 items, size 2 → two batches" case is tested, flag the empty-array and
`size <= 0` cases explicitly.

## Severity guidance

- WARNING when the missed corner case coincides with a plausible real bug
  (e.g. the `size <= 0` infinite loop above) — say so explicitly and treat
  it as a correctness finding, not just a coverage gap.
- SUGGESTION when the corner case is defensive completeness with low actual
  risk of hiding a bug.
