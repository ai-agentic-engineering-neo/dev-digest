---
name: flaky-tests
description: Flag tests that depend on time, order, or unseeded randomness.
---

# Flaky tests

When reviewing test changes, flag:

- `sleep` / `setTimeout` used to wait instead of awaiting the real signal
- assertions that depend on object-key or array order that is not part of the contract
- `Math.random()` or other unseeded PRNG in tests without a seed or mock

Do not flag deterministic fake clocks that the suite controls.
