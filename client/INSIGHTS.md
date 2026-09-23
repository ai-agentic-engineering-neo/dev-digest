# Insights — client

Accumulated lessons, non-trivial decisions, things we had to learn the hard
way. `CLAUDE.md` links here conditionally — read only when needed, not every
session.

Append-only: add to the bottom of the matching section, never rewrite or
delete. A finding that supersedes an older one gets its own dated entry; the
old entry stays. Format — `- YYYY-MM-DD — what is true. What to do or avoid
next time. (path/file.ts:42)`. Written by the `engineering-insights` skill, or
by hand in the same format.

## What Works

## What Doesn't Work

<!--
- 2026-09-18 — example entry: state what turned out to be true, then what to do
  or avoid next time, and point at the evidence. (`path/to/file.ts:42`)
-->

## Codebase Patterns

- 2026-09-21 — `visibleFindings()` (FindingsPanel/helpers.ts) is the single
  chokepoint for both the "hide low confidence" toggle and the severity
  filter. The severity-PILL counts must be tallied from the array it returns
  with `hideLow` already applied but BEFORE the severity filter — not from
  the raw `findings` prop — or the pill number silently stops matching the
  number of cards rendered once "hide low confidence" is on. Any new filter
  added to this panel must recompute counts from that same post-hideLow
  base, not from `findings` directly. (`client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/helpers.ts:5`)

## Tool & Library Notes

## Recurring Errors & Fixes

- 2026-09-20 — `pnpm typecheck` failing with "Two different types with this name
  exist, but they are unrelated" on a `@devdigest/shared` type means the
  contract was changed in `server/src/vendor/shared` but not in the client's
  copy (or vice versa) — the named property in the error message is the one
  that drifted. Fix it in `client/src/vendor/shared/contracts/*`, not in the
  component the error points at. (`client/src/vendor/shared/contracts/trace.ts:61`)
- 2026-09-21 — a hover popover positioned with `position: absolute` relative
  to a DOM ancestor renders invisible (silently clipped to nothing, no
  console error) if ANY ancestor between it and that positioning context has
  `overflow: hidden` — e.g. `tableCard` on the PR list clips rounded corners
  on purpose. `jsdom`/RTL unit tests cannot catch this class of bug: they
  don't compute real layout/overflow, so "the popover mounts with the right
  text" passes even when it would be invisible in a real browser. Found this
  live (user screenshot showed a clipped sliver on hover) after the popover's
  own unit tests were all green. Fix: render such popovers through a React
  Portal into `document.body`, positioned via a `getBoundingClientRect()`
  snapshot passed in as an `anchorRect` prop, not CSS relative to a DOM
  ancestor — a portal escapes any number of `overflow: hidden` ancestors
  regardless of nesting depth. (`client/src/components/severity/FindingsPopover.tsx`)
- 2026-09-21 — a long-running `pnpm dev` (Next 15.5.19) can poison `client/.next`
  mid-session: the PR detail route starts 500ing with `Cannot find module
  './vendor-chunks/recharts@2.15.4_....js'` (MODULE_NOT_FOUND) alongside
  `Could not find the module ...next-devtools/.../segment-explorer-node.js#SegmentViewNode
  in the React Client Manifest`. Nothing was edited and no test catches it — the
  vendor chunk simply goes missing from `client/.next/server/vendor-chunks/`
  while the dev server keeps running and serving `/_error`. Do NOT debug the
  route, the recharts import or the manifest error: restart `pnpm dev` (or
  `rm -rf client/.next` first), which regenerates the chunk and returns the
  route to 200. Suspect this whenever a route that worked an hour ago 500s with
  MODULE_NOT_FOUND on a `.next/server/vendor-chunks/*` path.
  (`client/src/app/repos/[repoId]/pulls/[number]/page.tsx`)
- 2026-09-21 — follow-up to the portal-popover entry above: `window.addEventListener("scroll", fn, {capture:true})`
  fires for a `scroll` event on ANY descendant element, not just real page/
  container scroll — `scroll` doesn't bubble, but capture-phase listeners
  still see it on the way down to whatever element it actually fired on. A
  "close the popover on scroll, since it can't reposition" listener wired
  this way therefore also fires when the popover's OWN `overflow-y: auto`
  list is scrolled (a portal's content is a real descendant of `window` in
  the DOM, even though it isn't a descendant of the trigger in the React
  tree) — every wheel-tick inside the popover closed it before it could
  render the new scroll offset, which looked like "scrolling down does
  nothing, scrolling up closes it" from the user's side. Confirmed live
  after unit tests (which never fired a real `scroll` event on the popover)
  passed. Fix: give the scroll handler a ref to the popover's own root and
  skip closing when `event.target` is inside it — only close for scroll
  that's genuinely NOT the popover. (`client/src/components/severity/useFindingsPopoverAnchor.ts`)

## Session Notes

## Open Questions
