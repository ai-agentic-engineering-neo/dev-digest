---
name: flaky-test-smells
description: >
  Flag tests in the diff that can pass or fail without a code change —
  real timers and sleeps, the wall clock, randomness, network, shared state, or
  dependence on test order.
type: rubric
---
# Flaky test smells

## When to apply
Any test file added or changed in the PR.

## Flag
- `setTimeout`, `sleep`, or fixed waits used to "let things settle" instead of
  awaiting the actual condition or using fake timers (`vi.useFakeTimers()`).
- `Date.now()` / `new Date()` / timezones read directly in the code under test
  or the assertion, without a fixed clock.
- `Math.random()`, generated ids, or unordered collections asserted by position.
- Real network, real filesystem paths, or a shared database without isolation.
- Module-level mutable state or mocks not reset between tests
  (`afterEach(vi.restoreAllMocks)` missing) — the test depends on run order.
- Retries (`retry: 3`) added to hide an intermittent failure.

## Severity
WARNING for a smell that makes CI non-deterministic, SUGGESTION otherwise.
category: `test`. Suggest the deterministic alternative in `suggestion`.
