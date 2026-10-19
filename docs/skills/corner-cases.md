---
name: corner-cases
description: Use when a changed function takes numbers, strings, collections, dates or optional values. Flag boundary and corner inputs the tests never try - zero, negative, empty, null/undefined, exactly-at-threshold, max size, duplicates.
type: rubric
---
# Missed corner cases

For each changed function that has tests in the diff, check the inputs the tests
use against this list and flag what is missing **when the code treats it
differently or could plausibly break on it**:

| Input kind | Corner cases to expect in tests |
|---|---|
| Numbers | `0`, negative, exactly at each threshold in the code (`>=` vs `>`), threshold ± 1, very large, `NaN` for parsed input |
| Strings | empty `""`, whitespace only, unicode / emoji, very long |
| Collections | empty, single element, duplicates, unsorted when code assumes order |
| Optional values | `null`, `undefined`, missing key |
| Dates / time | boundaries of day/month, time zones, DST, leap day |
| Money | rounding of fractions, currency minor units |

Threshold rule: when the code compares with a constant (`amount >= 100`), a test
must exist exactly AT the constant, otherwise an off-by-one (`>` vs `>=`)
survives. This is the most valuable corner case — report it first.

Report as WARNING; as CRITICAL only when the boundary decides money, access or
data deletion and no test is anywhere near it. Suggest the exact input value(s)
to add and the expected result.
