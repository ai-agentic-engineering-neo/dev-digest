# 0003 — No `src/features/` layer in the client yet

Status: Accepted · 2026-11-25 · plan item C9

## Context
Client code is organised by route: pages are thin, logic lives in colocated
`app/**/_components/<Name>/`, data in `lib/hooks`, shared UI in `components/`
and `vendor/ui` (skill `frontend-ui-architecture`). Two domain components sit in
`components/` (`diff-viewer`, `run-cost-badge`) because more than one route
uses them. A `src/features/<domain>/` layer would group domain UI, hooks and
helpers across routes.

## Decision
Don't add a `features/` layer now. Route-colocated `_components` plus
`components/` for cross-route pieces stay the rule; import direction is enforced
by ESLint (`vendor ← lib ← components ← app`).

## Consequences
- Fewer layers to learn; placement rules stay as documented in the skill.
- Cross-route domain UI keeps accumulating in `components/` — watch its size.

## Revisit when
- a domain's UI is used by three or more routes (reviews/findings are the likely first), or
- `components/` holds more domain components than shared presentational ones, or
- domain hooks and components start importing each other across routes.

Then: add `src/features/<domain>/`, move that domain first, and extend the
ESLint `import/no-restricted-paths` zones.
