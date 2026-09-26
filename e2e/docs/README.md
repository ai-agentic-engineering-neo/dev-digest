# docs — e2e

Deep-dives for the `e2e` package, **plus its written specs** — those live here,
not in `specs/`, which holds flow JSON. Linked from `e2e/CLAUDE.md` › *Read when*.

- **[`flow-authoring.md`](flow-authoring.md)** — how `run.ts` executes a flow,
  the `Flow` / `Step` types, why exit codes are the assertions, locator rules,
  env knobs, and how to add a flow.
- **[`coverage-spec.md`](coverage-spec.md)** — what each of the seven flows
  pins, the seed preconditions they depend on, and what is deliberately not
  covered.
