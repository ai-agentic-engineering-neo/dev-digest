# Flaky tests

Flag new or modified tests in this diff that are likely to pass or fail
non-deterministically, independent of whether the code under test is
correct.

## What to flag

- **Real timers / `sleep`-based waits**: `setTimeout`/`await new Promise(r
  => setTimeout(r, N))` used to "wait long enough" for something async to
  finish, instead of awaiting the actual promise/event/condition. Slow CI
  runners make these fail intermittently; fast ones can mask real races.
- **Wall-clock assumptions**: asserting on `Date.now()` / `new Date()`
  without freezing or injecting the clock — a test that compares two
  `Date.now()` calls with a tight tolerance, or that behaves differently
  around midnight/month/year boundaries or DST changes.
- **Unseeded randomness**: `Math.random()`, random UUIDs, or shuffled test
  data used to build fixtures without a fixed seed, where the assertion
  depends on a specific value or ordering.
- **Order-dependent assertions on unordered collections**: asserting exact
  array order from a DB query, `Object.keys()`, `Map`/`Set` iteration, or a
  concurrent `Promise.all` result where the underlying operation doesn't
  guarantee order (e.g. no `ORDER BY` in the query).
- **Shared mutable state across tests**: a module-level variable, a
  singleton, or a test DB row not cleaned up / reset in `beforeEach`, so
  test outcome depends on execution order or which tests ran before it.
- **Network/external calls not mocked**: a test that hits a real external
  service, or `container.llm(...)`/GitHub/git without going through this
  repo's `adapters/mocks.ts` — fails on rate limits, network blips, or
  when run offline.
- **Race conditions in the test itself**: firing multiple async operations
  and asserting on results without properly awaiting all of them (a missing
  `await`, or asserting inside a `.then()` that isn't returned/awaited by
  the test framework).

## How to judge

- A test is a flakiness risk if its pass/fail depends on timing, ordering,
  or an external system that this diff did not explicitly control for
  (fake timers, a seeded RNG, a mocked clock/adapter, or an explicit
  `ORDER BY`/sort before asserting).
- Distinguish from `.it.test.ts` integration tests in this repo, which
  legitimately use `testcontainers`/real Postgres — those are expected to
  be slower but should still avoid real sleeps and unseeded randomness.

## Example

```ts
// Flaky: races the debounce timer against real wall-clock time.
it('debounces the save', async () => {
  triggerSave();
  triggerSave();
  await new Promise((r) => setTimeout(r, 300));
  expect(saveSpy).toHaveBeenCalledTimes(1);
});
```

Prefer fake timers (`vi.useFakeTimers()` + `vi.advanceTimersByTime(300)`)
so the assertion is deterministic regardless of CI machine speed.

## Severity guidance

- WARNING for real-timer waits, unseeded randomness feeding an assertion,
  or unmocked external calls — these cause real, recurring CI flakiness.
- SUGGESTION for order-dependent assertions on collections where the
  underlying order happens to be stable today but isn't guaranteed.
