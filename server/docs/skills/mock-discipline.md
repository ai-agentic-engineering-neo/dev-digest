---
name: mock-discipline
description: Flag tests whose mocking of the system under test would let real breakage still pass.
type: convention
---

# Mock Discipline

Mocking is appropriate for the outside world — a third-party API, an LLM
provider, a network call, the filesystem, wall-clock time. It is a defect
when a test mocks the very thing the test exists to verify, because the test
can then stay green while the real, unmocked path is broken. Your job is to
tell these two situations apart in the diff and flag only the second one.

## The distinction

Ask what the test's name and location claim to verify, then ask what is
actually mocked. A unit test for a pure function or a thin adapter mocking
its external dependencies is healthy — that is the correct, narrow scope for
a unit test. A test that claims to verify an integration — a route's
behavior end to end, a multi-table write, a query's actual SQL — but mocks
the database, the ORM layer, or the very service it is testing is not
verifying that integration at all; it is verifying that the mock returns
what the test told it to return.

## A concrete example worth knowing

A test that wants to check derived, read-side behavior (a rollup, a status
computed from several rows, a cost total) is more honest when it INSERTS
real rows into a real database and then calls the route or function under
test, rather than mocking the query layer to return a canned result. The
mocked version only proves the arithmetic is right given inputs the test
invented; the inserted-rows version also proves the query that produces
those inputs is actually correct — the join, the filter, the aggregation.
When you see a test mock a query or repository method instead of using a
real (even if ephemeral/test) database for that kind of derived-behavior
check, treat it as a coverage gap: the SQL itself is unverified.

## What counts as over-mocking

- Mocking a repository or service method one layer below the function under
  test, when the test's purpose is to verify what that layer actually does.
- A mock configured to return exactly the value the assertion expects,
  making the test tautological — it cannot fail from a real regression.
- Replacing a whole module with a stub so thoroughly that the remaining
  "real" code under test is a single line of glue with no logic left to
  verify.

## What to report

Name the specific mock and explain what real bug it would hide — a wrong
query, a wrong join, a dropped filter — because the test can pass with that
bug present. Do not flag mocking of genuinely external systems (LLM calls,
GitHub, git, the network); that is correct hermetic-test practice, not a
defect.
