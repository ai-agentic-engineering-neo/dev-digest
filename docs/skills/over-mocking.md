---
name: over-mocking
description: Apply when a diff adds or changes tests that use mocks, stubs, spies or snapshots; check that the test can fail for a real regression and asserts behaviour rather than mock calls.
type: convention
---
# Over-mocking

A test must be able to fail when the behaviour it protects breaks. Mocks are fine at
I/O boundaries; they are a defect when they replace the thing being tested.

## Acceptable to mock
- Network and process boundaries: LLM providers, GitHub, git, HTTP clients,
  email, queues. In this repo use `server/src/adapters/mocks.ts`.
- The clock and randomness, when controlled (fake timers, seeded values).
- A repository or port when unit-testing a service in isolation, as long as the
  assertion is about the service's result.

## Not acceptable
1. **Mocking the unit under test**: the test imports module X, then mocks X (or its
   key internal function) and asserts the mock returned what it was told to.
2. **Asserting on mock calls instead of behaviour**: only `toHaveBeenCalled` /
   `toHaveBeenCalledWith` with no assertion on the returned value, the stored
   state or the response.
3. **Mock-everything tests**: every collaborator is mocked and the assertions only
   restate the mock setup, so no production change could make it fail.
4. **Snapshots of mocks** or of large objects nobody reviews; snapshots that are
   regenerated blindly.
5. **Over-specified interactions**: asserting call order or call counts of internal
   helpers, which breaks on harmless refactors.
6. **Always-true assertions**: `expect(x).toBeDefined()` on a value that is always
   defined, `expect(() => fn()).not.toThrow()` as the only check.
7. A DB-backed test that mocks the database; use a `*.it.test.ts` instead.

## Procedure
1. For each new or changed test, list what is mocked.
2. Ask: if the production logic were wrong, would this test fail?
3. Check the assertions target observable output (return value, response body,
   persisted row, emitted event).

## How to report
- Cite the test line with the weak mock or assertion.
- Say which regression would still pass, and what to assert instead.

## Severity guidance
- WARNING: a test that cannot fail or only checks mocks.
- CRITICAL: only when such a test is the sole coverage of a security, tenant-scope
  or contract-critical path.
- SUGGESTION: over-specified interaction assertions.
