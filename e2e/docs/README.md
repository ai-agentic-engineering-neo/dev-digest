# e2e/docs

Written specs and deep dives for the browser suite. `../specs/` holds only
executable `*.flow.json` files, so prose lives here.

Good candidates: a spec for a new flow before it is written (journey, seeded
data it relies on, visible text it asserts), the hermetic runner's port/DB
isolation, how to debug a failing step.

Not here: the flow format and run instructions (`../README.md`), lessons learned
(`../INSIGHTS.md`).

Files:

- [`hermetic-runner.md`](hermetic-runner.md) — how `scripts/e2e.sh` and `run.ts` work,
  CI differences, and the clash with a running dev stack.

The flows' written contract is the one exception kept next to them:
[`../specs/flows.md`](../specs/flows.md) (`run.ts` loads only `*.flow.json`).
