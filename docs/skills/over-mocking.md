---
name: over-mocking
description: Use when tests in the diff use mocks, stubs, spies or fakes (vi.mock, jest.mock, sinon, mockResolvedValue). Flag tests that mock the code under test, assert only on mocks, or mock so much that a real bug cannot fail them.
type: convention
---
# Over-mocking

A mock is fine at a process boundary (network, LLM, clock, filesystem, GitHub).
Flag a test when:

1. **It mocks the unit under test** (or a function in the same module that holds
   the logic being tested) — the test then verifies the mock, not the code.
2. **It asserts only interactions** (`toHaveBeenCalledWith`) and never the
   result or the resulting state, for code whose job is to compute a result.
3. **The mock returns exactly what the assertion expects** — the test passes
   whatever the production code does in between.
4. **The database or repository is mocked in a test of a query/repository** —
   SQL bugs cannot fail it; this repo uses testcontainers (`*.it.test.ts`) for that.
5. **Mocks are not reset** between tests (`vi.restoreAllMocks`, `mockReset`),
   so tests depend on order.

Severity: WARNING by default; CRITICAL when the over-mocked test is the only test
of a money / auth / data-deletion path. Suggest what to keep real and what to
assert on instead.
