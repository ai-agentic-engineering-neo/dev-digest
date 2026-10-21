---
name: test-naming-convention
description: Flag test titles that do not state the input and the expected outcome.
type: convention
---
# Test naming convention

A test title must read as a sentence with the situation and the expected result: `returns 404 when the agent belongs to another workspace`, not `works` or `test agent`. Flag as SUGGESTION, citing the `it(` line, any test in the diff whose title is a single word, repeats the function name only, or omits the expected outcome. One finding per file at most; list the offending titles in the rationale.
