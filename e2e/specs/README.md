# e2e — specs

One spec per milestone feature, written before the code. A spec here covers this
package's part of the feature: browser journeys covered by flows. It states what
will be built and how we will know it works; lessons go in
[`../INSIGHTS.md`](../INSIGHTS.md).

This folder also holds the runnable flows (`NN-name.flow.json`). The runner
picks up only files ending in `.flow.json`, so markdown specs here are ignored
by it. Flow format is described in the [package README](../README.md).

- Name files `M<n>-<feature>.md`, for example `M1-cost-badge.md`.
- Start from [`_template.md`](_template.md).
- The milestone list is the [roadmap in the main README](../../README.md#roadmap).
- When a feature spans packages, each package gets its own spec with the same
  file name, and each links to the others under "Related specs".
- Package architecture is in [`../docs/architecture.md`](../docs/architecture.md);
  cross-package rules are in [`../../docs/architecture.md`](../../docs/architecture.md).

## Index

Add a row when a spec is created.

| Spec | Milestone | Status |
|------|-----------|--------|
| —    | —         | —      |
