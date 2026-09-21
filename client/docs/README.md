# client — docs

How `@devdigest/web` is built. Feature contracts live in `specs/` (one file per feature, e.g. `001-run-cost-badge.md`).

| File | Read when |
|---|---|
| `overview.md` | Deciding where data fetching, types, or UI primitives come from; checking what the client must never import. |
| `structure.md` | Locating a route (`src/app/**/page.tsx`), a colocated `_components/<Name>/` folder, a hook, or an i18n namespace. |
| `patterns.md` | Adding a screen, a component with its test, a data hook for a new endpoint, or an i18n key. |

Sibling docs that stay where they are: `README.md` (route map), `INSIGHTS.md` (lessons), `CLAUDE.md` (commands).

Paths in these docs are relative to the package root (`client/`); `../` points at the repo root.
