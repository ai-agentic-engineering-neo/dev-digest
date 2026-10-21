---
name: async-test-hygiene
description: Every promise in a test is awaited or returned; no fire-and-forget assertions.
type: convention
---
# Async test hygiene

Flag as WARNING, citing the line, any test in the diff where:

- an `async` function is called without `await` or `return`, so its assertions or rejections run after the test ends
- `expect(promise).rejects` / `.resolves` is not awaited
- a callback-style API is asserted inside the callback with no `done` or promise wrapper
- `Promise.all` is used to run assertions whose order matters

Say which assertion could silently pass and why.
