# client (@devdigest/web)

## Before answering

Search `client/docs/`, `client/specs/`, `client/INSIGHTS.md` first.

## Conventions (not obvious from code)

- Types/contracts come from `@devdigest/shared` (Zod, vendored under
  `src/vendor/shared`) — never hand-duplicate them.
- All API access goes through `src/lib/api.ts`; every data hook lives in
  `src/lib/hooks/*`.
- Feature logic is colocated in `_components/<Name>/` next to each route —
  pages themselves stay thin.

## Use when

- Route map, commands → read `README.md`
- Deep-dives → `client/docs/` · UI/flow specs → `client/specs/` · running
  notes → `client/INSIGHTS.md`
- Real-browser verification of a flow → `../e2e/README.md`
- Cross-package rules (vendoring, ESM imports) → `../CLAUDE.md`
