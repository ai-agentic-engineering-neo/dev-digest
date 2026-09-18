# docs — client

Deep-dives for the `client` package (pipelines, diagrams, design notes).

## Vendoring: why `src/vendor/*` instead of a published package

`@devdigest/shared` (Zod contracts) and `@devdigest/ui` (design-system
primitives) are NOT real npm packages — there's no monorepo workspace, no
`pnpm-workspace.yaml`, and no re-vendor tooling in this checkout. They're
plain TypeScript trees under `src/vendor/shared` and `src/vendor/ui`,
imported via `tsconfig.json` path aliases. `@devdigest/shared` is meant to
stay byte-identical to `server`'s copy of the same contracts (hand-edit both,
then `diff` — see root `CLAUDE.md`'s do-not-touch section); `@devdigest/ui`
has no second copy anywhere in the repo, so it's safe to hand-edit directly
(confirmed by grepping for a server-side `vendor/ui` — none exists; UI
primitives are a client-only concern).

## Why route-local `_components/` instead of a shared `components/`

Feature logic for one route lives in `_components/<Name>/` (PascalCase)
colocated with that route's `page.tsx`, so a reviewer can delete or move a
route without hunting for orphaned files elsewhere. Anything used by *more
than one route* — `run-cost-badge/`, `findings-by-severity/` — moves to
`src/components/<name>/` (kebab-case) instead. This distinction is easy to
get backwards; see the `client/INSIGHTS.md` entry on this.

## The severity-findings popover: the first portal in this codebase

`components/findings-by-severity/SeverityFindingsPopover.tsx` is the first
component in `client/src` to use `createPortal`. Every prior "floating
panel" (`vendor/ui/kit/Dropdown.tsx`) used plain `position: absolute` inside
a `position: relative` wrapper — fine for a small in-context menu, but the PR
list's table card has `overflow: hidden` (`pulls/styles.ts`'s `tableCard`),
which would silently clip an absolutely-positioned popover hanging off a row.
Portaling to `document.body` with `position: fixed`, computed from
`getBoundingClientRect()` at open time, sidesteps that entirely. The
tradeoff: hover/click/outside-click detection has to check both the trigger
element's ref AND the portaled panel's ref (`FindingsBySeverityBadge.tsx`),
since they're no longer DOM-nested — a single `ref.contains()` check (as
`Dropdown.tsx` uses) isn't enough once a portal is involved.

## Two different "which findings count" rules on purpose

`FindingsPanel`'s severity pills (Review-runs accordion) and
`FindingsBySeverityBadge`'s popover (PR list / Timeline) intentionally answer
"does this finding count?" differently — see `specs/README.md`'s
"Findings by severity" section for the exact rule per surface, and don't
"fix" them into agreement; they're previewing different things (a rendered
list below the pills, vs. a self-contained read-only summary in the popover).
