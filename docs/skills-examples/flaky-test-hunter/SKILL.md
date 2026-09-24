---
name: flaky-test-hunter
description: Flag tests in the diff that depend on real time, sleeps, execution order, shared state or the network, so they pass locally and fail intermittently in CI.
type: rubric
---
# Flaky test hunter

Read every added or changed test. Report a pattern only when it appears in the
diff, cite the test line, and name the deterministic alternative in the
suggestion. Category: `test`. Never CRITICAL.

## WARNING
- **Sleeping to wait** — `setTimeout`, `sleep(n)` or `await delay(n)` used to wait
  for async work. Await the promise, poll a condition with a deadline, or use
  fake timers (`vi.useFakeTimers()` + `vi.advanceTimersByTime`).
- **Wall clock** — assertions on `Date.now()`, `new Date()` or "today" without a
  fixed clock (`vi.setSystemTime`, an injected clock).
- **Order dependence** — a test that only passes after another one ran: shared
  module state, a DB row or a file created elsewhere, no reset in `beforeEach`.
- **Racing promises** — asserting the completion order of parallel work
  (`Promise.all` results are ordered; completion is not).
- **Real I/O in unit tests** — network, DNS, the current working directory or the
  user's home directory.
- **Unseeded randomness** — random data that decides which branch runs.

## SUGGESTION
- A raised per-test timeout that hides a slow or hanging test.
- `retry` added to a test instead of fixing its cause.

## Do not flag
- Integration tests that start real services on purpose (e.g. Testcontainers)
  when they wait on a readiness check rather than a fixed sleep.
- Timers inside code under test when the test controls them with fake timers.
