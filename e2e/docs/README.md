# e2e — docs index

Deeper design notes for `e2e/`, one topic per file. The package `README.md` stays the canonical overview;
put here what is too detailed for it. Add each new doc to the list below with a one-line "read when".

<!-- - [topic.md](topic.md) — read when … -->
- [how-flows-work.md](how-flows-work.md) — read when debugging a failing run, changing `run.ts`/`lib/assert.ts`, or deciding between hermetic / CI / own-stack runs
- [writing-a-flow.md](writing-a-flow.md) — read when adding or editing a `specs/NN-name.flow.json` (seed facts, locator rules, where visible text comes from)

Flow index with each flow's purpose and assertions: [`../specs/README.md`](../specs/README.md).
