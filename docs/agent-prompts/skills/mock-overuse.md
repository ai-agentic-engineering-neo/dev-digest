# Mock overuse

Flag tests (new or modified in this diff) that mock away so much of the
system under test that the test can pass while the real code is broken.

## What to flag

- **Mocking the thing you're testing**: a unit test for `formatInvoice()`
  that mocks `formatInvoice`'s own internal helper instead of letting real
  logic run, so the assertion only checks that a mock was called with the
  right args — not that the output is correct.
- **Over-mocked collaborators**: mocking a pure function, a simple data
  transform, or an in-memory data structure that would be cheap and safe to
  run for real. Mocking should be reserved for genuine I/O boundaries
  (network, DB, filesystem, clock, randomness) — not everything a module
  imports.
- **Mock return values that don't match the real shape**: a mocked DB call
  or API response stubbed with a shape that the real driver/client would
  never actually return (missing required fields, wrong types) — the test
  proves nothing about the real integration.
- **Assertions on the mock instead of on behavior**: `expect(mockFn).
  toHaveBeenCalled()` as the ONLY assertion, with no check of the resulting
  state/output/return value. This can stay green even if the code path that
  used the mock's result is deleted.
- **Snapshot/mock churn as a smell**: a diff that "fixes" a failing test
  purely by adding/loosening a mock (e.g. `mockResolvedValue(undefined)` to
  silence a type error) rather than addressing why the real call would
  behave that way.
- **Mocking the module under test's own dependency graph so deeply that
  the test only verifies wiring, not logic** — e.g. mocking every Drizzle
  query in a repository test so no actual query-building logic ever runs.

## How to judge

- Ask: if I reverted the production code change but kept this test, would
  it still pass? If yes because the mock always returns a canned value
  regardless of the real implementation, that's a strong signal of
  overmocking.
- Distinguish legitimate mocking of external boundaries (this repo's own
  `adapters/mocks.ts` pattern — `MockGitClient`, `MockGitHubClient`, a
  stubbed `LLMProvider`) from mocking internal, pure, deterministic logic
  that should just run for real in a unit test.
- Prefer fakes/real implementations over mocks for anything in-memory and
  fast (e.g. use a real array/object instead of a mocked repository when
  the repository itself is what's under test).

## Severity guidance

- WARNING when the overmocking means the test would pass with a broken
  implementation (a false sense of coverage) — this is the core risk to
  call out.
- SUGGESTION for mocking that's merely more verbose/brittle than necessary
  (e.g. re-mocking something `adapters/mocks.ts` already provides) but
  doesn't actually hide a bug.
