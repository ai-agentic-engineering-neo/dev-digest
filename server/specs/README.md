# server — specs

One spec per milestone feature, written before the code. A spec here covers this
package's part of the feature: API routes, modules, tables and adapters. It states what
will be built and how we will know it works; lessons go in
[`../LEARNINGS.md`](../LEARNINGS.md).

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
| [M1-cost-badge.md](M1-cost-badge.md) | M1 | built |
| [M1-findings-column.md](M1-findings-column.md) | M1 | approved |
