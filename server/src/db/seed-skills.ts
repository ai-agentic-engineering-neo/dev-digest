/**
 * Bodies for the built-in skills seeded onto Test Quality Reviewer.
 *
 * These mirror the human-readable originals in `docs/skills/<slug>.md` (server
 * package docs, not the repo-root agent-prompts dir). Keep the two in sync when
 * you edit a skill body. The DB row (`skills.body` + the matching
 * `skill_versions` row) is the source of truth at run time; editing a body here
 * only affects freshly seeded workspaces.
 */

export const BRANCH_COVERAGE_GATE_BODY = `# Branch Coverage Gate

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
still worth raising, but not something that should stop the merge on its own.`;

export const CORNER_CASE_CHECKLIST_BODY = `# Corner Case Checklist

When a diff adds a new code path — a new function, a new branch in an
existing one, a new endpoint, a new parser — check it against the following
categories before deciding its tests are adequate. Not every category applies
to every change; apply judgment, but do not skip the check silently.

## Null / undefined
Does the new path accept an argument, request field, or optional value that
could legitimately be null or undefined? If so, is there a test for that
case, and does the code's handling of it match the rest of the codebase's
convention (an absent value renders or behaves as "unknown," never silently
coerced into a wrong default)? A common bug shape: \`value ?? 0\` used where
"unknown" and "zero" are meaningfully different states.

## Empty collections
An empty array or empty object is a distinct case from "one item" and is
frequently the one that breaks: \`.reduce()\` with no seed on an empty array
throws, \`Math.max(...[])\` returns \`-Infinity\`, a \`for\` loop over zero items
silently does nothing when the caller expected an error. Check that a new
function over a collection has a deliberate answer for the empty case, and
that the test suite exercises it — not just a happy path with two or three
items.

## Boundary offsets
Pagination, limits, indices, and counts are off-by-one magnets. Check the
first item, the last item, the exact limit value, and one past the limit.
A loop with \`<\` where the diff needed \`<=\` (or vice versa) is invisible in a
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
worth reporting under this skill.`;

export const MOCK_DISCIPLINE_BODY = `# Mock Discipline

Mocking is appropriate for the outside world — a third-party API, an LLM
provider, a network call, the filesystem, wall-clock time. It is a defect
when a test mocks the very thing the test exists to verify, because the test
can then stay green while the real, unmocked path is broken. Your job is to
tell these two situations apart in the diff and flag only the second one.

## The distinction

Ask what the test's name and location claim to verify, then ask what is
actually mocked. A unit test for a pure function or a thin adapter mocking
its external dependencies is healthy — that is the correct, narrow scope for
a unit test. A test that claims to verify an integration — a route's
behavior end to end, a multi-table write, a query's actual SQL — but mocks
the database, the ORM layer, or the very service it is testing is not
verifying that integration at all; it is verifying that the mock returns
what the test told it to return.

## A concrete example worth knowing

A test that wants to check derived, read-side behavior (a rollup, a status
computed from several rows, a cost total) is more honest when it INSERTS
real rows into a real database and then calls the route or function under
test, rather than mocking the query layer to return a canned result. The
mocked version only proves the arithmetic is right given inputs the test
invented; the inserted-rows version also proves the query that produces
those inputs is actually correct — the join, the filter, the aggregation.
When you see a test mock a query or repository method instead of using a
real (even if ephemeral/test) database for that kind of derived-behavior
check, treat it as a coverage gap: the SQL itself is unverified.

## What counts as over-mocking

- Mocking a repository or service method one layer below the function under
  test, when the test's purpose is to verify what that layer actually does.
- A mock configured to return exactly the value the assertion expects,
  making the test tautological — it cannot fail from a real regression.
- Replacing a whole module with a stub so thoroughly that the remaining
  "real" code under test is a single line of glue with no logic left to
  verify.

## What to report

Name the specific mock and explain what real bug it would hide — a wrong
query, a wrong join, a dropped filter — because the test can pass with that
bug present. Do not flag mocking of genuinely external systems (LLM calls,
GitHub, git, the network); that is correct hermetic-test practice, not a
defect.`;

export const FLAKY_TEST_PATTERNS_BODY = `# Flaky Test Patterns

A test that can pass or fail depending on timing, ordering, or randomness is
worse than no test: it erodes trust in the whole suite and eventually gets
ignored or retried into silence. Your job is to spot the specific patterns
that produce this outcome and flag them before they land.

## Timeouts that return instead of throwing

The most dangerous version of this pattern is a poll/wait helper that is
supposed to wait for some async condition (a job finishing, a run reaching a
terminal state) but, after its timeout elapses, simply RETURNS whatever
state exists instead of throwing. Every assertion downstream of that helper
then silently runs against a half-finished state. The failure this produces
is confusing and far from its true cause — an assertion several lines later
fails with a value that looks merely wrong, not "this timed out." When you
see a wait/poll helper in a diff, check explicitly whether its timeout path
throws or returns; if it returns, flag it, and flag any test that calls it
without independently asserting the state actually reached is terminal
before relying on it.

## Unseeded randomness

\`Math.random()\`, random UUIDs used to pick test data, or shuffled inputs with
no fixed seed make a test's behavior different on every run. If the test's
correctness depends on a property that only holds for the specific value
produced this run, it will eventually fail on a value nobody can reproduce.
Flag any new randomness in a test that is not explicitly seeded or mocked to
a fixed value.

## Real-clock dependence

A test that reads \`Date.now()\` or \`new Date()\` and asserts on a computed
duration, "is this stale," or ordering can fail under CI load, clock skew, or
simply bad luck near a boundary (midnight, a monthly rollover). Flag tests
that do not inject or fix the clock when the code under test takes time as an
input — the surrounding codebase already does this correctly in places
(passing an explicit \`now\` timestamp rather than reading the system clock
inside the function under test); a new test that reads the real clock instead
is a step backward.

## Order-dependent state

A test that mutates module-level state, a shared fixture, or a database row
that a sibling test also touches — and only passes because of the order
vitest happens to run files in — will break the moment tests are
parallelized, filtered, or reordered. Flag shared mutable state between test
cases that is not reset in a \`beforeEach\`/\`afterEach\`, and flag any comment
or ordering assumption ("this must run after the previous test") as a defect
in itself.

## What to report

Name the specific nondeterministic mechanism and describe the concrete way it
can fail: what condition makes it flake, and why the resulting failure would
be confusing rather than a clean, immediate signal of the real problem.`;
