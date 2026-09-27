---
name: flaky-test-heuristics
description: Detects timing, ordering and shared-state sources of flaky tests.
type: custom
---

# Flaky test heuristics

A test that can fail without the code changing is a defect in the test. Flag
these patterns in added or modified tests:

- **Time** — `sleep`/`setTimeout` used as synchronisation; an assertion on
  `Date.now()`, a duration, or a timestamp formatted in the local timezone.
- **Order** — state written in one test and read in another; a module-level
  `let` mutated inside a test; reliance on the order of an unsorted query or of
  `Object.keys`.
- **Concurrency** — a promise started and never awaited; a race between a fake
  timer and a real one; an unmocked interval left running after the test.
- **Environment** — a real network or filesystem call; a hard-coded port; a
  random value without a fixed seed.

Report the failure mode, not the style: say what would make it red on a slow CI
machine. Severity WARNING, or CRITICAL when the test guards a security or
data-integrity behaviour and could pass while that behaviour is broken.
