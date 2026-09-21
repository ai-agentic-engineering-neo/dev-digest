# server — docs

How `@devdigest/api` is built. Feature contracts live in `specs/` (one file per feature, e.g. `001-run-cost.md`).

| File | Read when |
|---|---|
| `overview.md` | Deciding whether code belongs in a module, an adapter, `platform/`, or `reviewer-core`; checking who imports what. |
| `structure.md` | Locating a folder (`src/modules`, `src/adapters`, `src/platform`, `src/db`, `test/`) or a reference file to copy from. |
| `patterns.md` | Adding an endpoint, a module, a DB column + migration, or a new adapter port. |

Sibling docs that stay where they are: `README.md` (API map, env table), `src/modules/repo-intel/README.md` (indexer), `INSIGHTS.md` (lessons).

Paths in these docs are relative to the package root (`server/`); `../` points at the repo root.
