# specs — e2e

Browser flows (`NN-name.flow.json`) executed by `run.ts` in filename order — not
written specs, which live in [`../docs/`](../docs/). The runner ignores anything
that is not `*.flow.json`, including the markdown here.

- Flow format, locator rules and env knobs: [`../README.md`](../README.md) and
  [`../docs/flow-authoring.md`](../docs/flow-authoring.md).
- What these flows pin: [`../docs/coverage-spec.md`](../docs/coverage-spec.md).
- [`behaviour-spec.md`](behaviour-spec.md) is a pointer to the above, kept here
  so the written spec is findable from the folder people look in first.
