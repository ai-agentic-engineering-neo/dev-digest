# specs — pointer

**This folder holds browser flows (`NN-name.flow.json`), not written specs.**
`run.ts` executes every `*.flow.json` here in filename order and ignores
everything else, including this file.

The written specification for the suite lives one folder over:

- **[`../docs/coverage-spec.md`](../docs/coverage-spec.md)** — what each flow
  pins, the seed preconditions it depends on, and what is deliberately not
  covered.
- **[`../docs/flow-authoring.md`](../docs/flow-authoring.md)** — how the runner
  executes a flow, the `Flow` / `Step` types, locator rules and env knobs.

New prose belongs in `../docs/`. Keeping this folder machine-only is what lets
the runner glob it without a filter.
