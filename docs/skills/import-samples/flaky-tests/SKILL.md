---
name: flaky-tests
description: Use when tests in the diff touch time, randomness, timers, network, ordering or shared state. Flag tests that can pass and fail on the same code - real clock/sleep, unseeded random, real network, order-dependent shared state, unawaited promises.
type: rubric
allowed-tools: Bash(scripts/detect-flaky.sh)
---
# Flaky tests

Flag a test in the diff when its outcome depends on something other than the
code under test:

1. **Real time** — `Date.now()`, `new Date()`, `setTimeout`/`sleep` with a fixed
   delay, timing assertions (`expect(ms).toBeLessThan(100)`). Use fake timers
   (`vi.useFakeTimers`) or inject a clock.
2. **Randomness** — `Math.random`, `crypto.randomUUID`, faker without a seed,
   when the assertion depends on the value.
3. **Real network / services** — HTTP to a real host, real LLM, real GitHub.
4. **Shared mutable state** — module-level variables, a shared DB without
   isolation, tests that pass only in a specific order, `.only` left behind.
5. **Unawaited async** — a promise or `expect(...).rejects` not awaited, an
   event-based assertion without waiting for the event.
6. **Order assumptions** — asserting array order from an unordered source
   (DB query without `ORDER BY`, `Object.keys` of user data, `Promise.all` side
   effects).

Severity: WARNING (flaky in CI); SUGGESTION when the risk is theoretical.
Suggest the deterministic replacement (fake timers, seeded generator, mock at
the boundary, explicit ordering, `await`).
