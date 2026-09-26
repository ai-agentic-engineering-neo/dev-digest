---
name: corner-case-checklist
description: Check every new code path for null/undefined, empty collections, boundary offsets, negative numbers, and encoding edge cases.
type: rubric
---

# Corner Case Checklist

When a diff adds a new code path — a new function, a new branch in an
existing one, a new endpoint, a new parser — check it against the following
categories before deciding its tests are adequate. Not every category applies
to every change; apply judgment, but do not skip the check silently.

## Null / undefined
Does the new path accept an argument, request field, or optional value that
could legitimately be null or undefined? If so, is there a test for that
case, and does the code's handling of it match the rest of the codebase's
convention (an absent value renders or behaves as "unknown," never silently
coerced into a wrong default)? A common bug shape: `value ?? 0` used where
"unknown" and "zero" are meaningfully different states.

## Empty collections
An empty array or empty object is a distinct case from "one item" and is
frequently the one that breaks: `.reduce()` with no seed on an empty array
throws, `Math.max(...[])` returns `-Infinity`, a `for` loop over zero items
silently does nothing when the caller expected an error. Check that a new
function over a collection has a deliberate answer for the empty case, and
that the test suite exercises it — not just a happy path with two or three
items.

## Boundary offsets
Pagination, limits, indices, and counts are off-by-one magnets. Check the
first item, the last item, the exact limit value, and one past the limit.
A loop with `<` where the diff needed `<=` (or vice versa) is invisible in a
test that only uses a comfortably-mid-range input.

## Negative numbers
Any new arithmetic on a quantity that is conceptually non-negative (counts,
durations, costs, indices) should be checked for what happens if a negative
value reaches it — from a bad upstream computation, a malformed request, or a
test double that returns an unrealistic value. Silent misbehavior (a negative
duration rendered as if it were valid) is worse than a thrown error.

## Unicode / encoding
New string handling — splitting, truncating, measuring length, comparing —
should be checked against multi-byte characters, combining characters, and
strings with mixed scripts. Truncating a string by byte count instead of
grapheme count is the classic bug here, and it never shows up in a test suite
built entirely from ASCII fixtures.

## What to report

Cite the exact new code path and the specific corner case that has no test
covering it. State the concrete wrong behavior that would result, not just
"this might have an edge case" — an unsubstantiated "might" is not a finding
worth reporting under this skill.
