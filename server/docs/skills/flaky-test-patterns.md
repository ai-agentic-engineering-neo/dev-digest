---
name: flaky-test-patterns
description: Flag tests whose pass/fail outcome is nondeterministic — timeouts that do not throw, unseeded randomness, real-clock or ordering dependence.
type: convention
---

# Flaky Test Patterns

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

`Math.random()`, random UUIDs used to pick test data, or shuffled inputs with
no fixed seed make a test's behavior different on every run. If the test's
correctness depends on a property that only holds for the specific value
produced this run, it will eventually fail on a value nobody can reproduce.
Flag any new randomness in a test that is not explicitly seeded or mocked to
a fixed value.

## Real-clock dependence

A test that reads `Date.now()` or `new Date()` and asserts on a computed
duration, "is this stale," or ordering can fail under CI load, clock skew, or
simply bad luck near a boundary (midnight, a monthly rollover). Flag tests
that do not inject or fix the clock when the code under test takes time as an
input — the surrounding codebase already does this correctly in places
(passing an explicit `now` timestamp rather than reading the system clock
inside the function under test); a new test that reads the real clock instead
is a step backward.

## Order-dependent state

A test that mutates module-level state, a shared fixture, or a database row
that a sibling test also touches — and only passes because of the order
vitest happens to run files in — will break the moment tests are
parallelized, filtered, or reordered. Flag shared mutable state between test
cases that is not reset in a `beforeEach`/`afterEach`, and flag any comment
or ordering assumption ("this must run after the previous test") as a defect
in itself.

## What to report

Name the specific nondeterministic mechanism and describe the concrete way it
can fail: what condition makes it flake, and why the resulting failure would
be confusing rather than a clean, immediate signal of the real problem.
