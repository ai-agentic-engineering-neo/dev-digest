---
name: missing-corner-cases
description: Apply when a diff changes logic that processes input, collections, numbers, strings, dates or concurrent work; check whether tests cover the plausible boundary and edge cases for that specific code.
type: rubric
---
# Missing corner cases

Use this catalogue to decide which edge cases are plausible for the changed code,
then check that a test covers each. Flag only cases that could really occur given
the inputs of THIS code. A catalogue entry that cannot happen here is not a finding.

## Catalogue
- **Empty**: empty array, empty string, empty object, no rows from the DB.
- **Absent**: `null`, `undefined`, missing optional field, optional chaining that
  silently returns `undefined`.
- **Numbers**: zero, negative, `NaN`, very large values, floating-point rounding.
- **Limits**: exactly at the limit, one below, one above (off-by-one in `<` vs `<=`,
  slice bounds, pagination first/last page, page size 0 or 1).
- **Size**: a single element, and many elements (truncation, batching).
- **Strings**: whitespace-only, very long, unicode (emoji, combining characters,
  RTL), case differences, characters that need escaping.
- **Duplicates**: repeated ids or names, idempotent re-run of the same operation.
- **Ordering**: unsorted input, ties, stable order expectations.
- **Time**: time zones, DST, midnight and month boundaries, clock skew, expiry
  exactly at "now".
- **Concurrency**: two simultaneous calls, retry after partial failure, race
  between check and write.
- **Error paths**: dependency throws, times out, returns a malformed or partial
  payload; permission denied; not found.

## Procedure
1. Read the changed production code and note its inputs and their types.
2. Pick the catalogue entries that apply to those inputs.
3. Check the tests in the diff for each picked entry.
4. Report the most valuable missing cases; skip the rest.

## How to report
- Cite the production line that handles the input.
- State the concrete input ("`limit = 0`", "an empty `files` array") and what
  would go wrong (division by zero, crash on `[0]`, silent wrong result).
- Describe the missing test: input and expected outcome.

## Severity guidance
- WARNING: a plausible boundary or error path with no test.
- CRITICAL: only when the unhandled edge leads to data loss, wrong money/permission
  results or a crash on realistic input and nothing in the diff would catch it.
- SUGGESTION: an unlikely edge or one cheap to add.

## Do not flag
- Edges the type system or zod validation already makes impossible.
- A long wishlist: pick at most the few that matter for this change.
