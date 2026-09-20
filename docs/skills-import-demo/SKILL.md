---
name: error-path-rubric
description: Check that every new error path in the diff is reachable, logged once, and surfaced to the caller.
---

# Error-path rubric

For every `throw`, rejected promise, and non-2xx return the diff adds:

1. **Reachable** — name the input that reaches it. An error branch no input can
   reach is dead code, not safety.
2. **Logged once** — the error is logged at exactly one level of the stack.
   Logging in the thrower *and* every catcher turns one incident into noise.
3. **Surfaced** — the caller learns what happened: a status code, an error code,
   or a typed result. A `catch {}` that returns a default is a silent failure.
4. **Typed** — the thrown value is an `Error` (or a subclass), never a string or
   a bare object.

Flag a swallowed error as CRITICAL when it hides data loss or a failed write,
and as WARNING otherwise.
