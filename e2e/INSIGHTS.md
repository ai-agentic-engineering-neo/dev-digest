# Insights — e2e

Non-obvious findings for agents working in this package, written via the `engineering-insights` skill.
Entries are hints to verify, not rules: if the code disagrees, the code wins — add a `contradicted` comment.
Add only: new entries go last in their section; comments go as indented sub-bullets under the entry they refer to.
Format: `` - YYYY-MM-DD · <insight> — <why>. Evidence: `path` (`symbol`) `` — no line numbers.
Hygiene: monthly `/engineering-insights review` (logged under Review log); split into `INSIGHTS-<domain>.md` past ~100 entries.

## Patterns

## Mistakes

## Decisions

## Context
- 2026-11-28 · Without `npm ci` in `e2e/`, `npm run typecheck` falls back to a global `tsc` and fails with TS2688 "Cannot find type definition file for node" plus a `moduleResolution` error — install the package deps first; the code is fine. Evidence: `e2e/tsconfig.json`

## Open Questions

## Review log
