---
name: flaky-test-patterns
description: Apply when a diff adds or changes tests; check for patterns that make tests pass or fail nondeterministically (sleeps, real time, unseeded randomness, shared state, real I/O, unawaited promises).
type: rubric
---
# Flaky test patterns

A flaky test passes and fails on the same code. Check new and changed tests for the
patterns below and report only those present in the diff.

## Patterns
1. **Sleeps and timeouts**: `setTimeout`, `sleep(…)` or a fixed delay used to wait
   for something. Fix: await the actual event or use fake timers.
2. **Time and date dependence**: `Date.now()`, `new Date()`, "today", expiry or
   age computed from the real clock. Fix: inject or freeze the clock.
3. **Unseeded randomness**: `Math.random()`, random ids or shuffles with no seed.
4. **Shared mutable state and test order**: module-level variables, a shared
   database row or singleton mutated by one test and read by another; tests that
   only pass when run in a given order. Fix: set up and tear down per test.
5. **Real network or I/O**: calls to real HTTP hosts, the real filesystem outside a
   temp dir, a real LLM. Hermetic tests must use the mocks.
6. **Unawaited promises**: a missing `await` or `return` so the assertion runs after
   the test ends, or an error is swallowed.
7. **Port collisions**: a fixed port for a server in tests. Fix: listen on port 0.
8. **Async assertions without waiting**: asserting on UI or state right after an
   action instead of `await`ing `findBy…` / `waitFor` / the emitted event.
9. **Environment coupling**: reliance on locale, time zone, working directory or
   environment variables that differ across machines.

## How to report
- Cite the test line with the pattern.
- State the nondeterminism mechanism ("passes only if the 50 ms timer fires before
  the 10 ms query resolves").
- Give the deterministic replacement.

## Severity
- WARNING for a flaky pattern in a test that gates merges.
- SUGGESTION for a low-risk pattern (for example a seeded random).
