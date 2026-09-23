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

- 2026-09-23 — the vendored `Dropdown` CANNOT host a multi-select menu, and
  this is structural, not a styling gap: `DropdownItem` calls `onClose()`
  immediately after `it.onClick?.()` on every row click, so the menu closes
  before a second box could be ticked, and `DropdownItemDef` has no
  `checked`/`selected`/`disabled` field to render a checkbox with anyway.
  The tempting fix — adding `checkbox`/`keepOpen` to `DropdownItemDef` — is
  wrong twice over: `src/vendor/ui` is a hand-synced copy and do-not-touch
  (`client/CLAUDE.md`), so the edit is silently lost on the next sync, and it
  forks the primitive's behaviour for every other caller. Build the popover
  locally in the feature folder instead, mirroring `Dropdown`'s own mechanics
  (relative wrapper + absolute panel + `mousedown`-outside close) and its
  tokens (`--bg-elevated`, `--border-strong`, `--shadow-modal`) so it still
  reads as the same primitive next to real Dropdowns in the same header.
  Worked example: the Run Review agent picker.
  (`client/src/vendor/ui/kit/Dropdown.tsx:12`,
  `client/src/app/repos/[repoId]/pulls/[number]/_components/RunReviewDropdown/RunReviewDropdown.tsx:1`)

## Codebase Patterns

- 2026-09-21 — `visibleFindings()` (FindingsPanel/helpers.ts) is the single
  chokepoint for both the "hide low confidence" toggle and the severity
  filter. The severity-PILL counts must be tallied from the array it returns
  with `hideLow` already applied but BEFORE the severity filter — not from
  the raw `findings` prop — or the pill number silently stops matching the
  number of cards rendered once "hide low confidence" is on. Any new filter
  added to this panel must recompute counts from that same post-hideLow
  base, not from `findings` directly. (`client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/helpers.ts:5`)
- 2026-09-23 — `SeverityPills` is one component with three behaviours, selected
  by which props it gets, and the prop combination IS the contract: `onSelect`
  + `active` → a filter control with `aria-pressed` (review-run accordion);
  `onSelect` alone → navigates, deliberately no pressed state (PR-list row);
  neither → plain non-interactive spans (Timeline tiles). Before changing what
  a pill does, check all three call sites — an unconditional `aria-pressed` or
  a pressed outline would make the PR-list pill claim a toggle state it doesn't
  have. Adding a fourth behaviour should mean a new prop with an explicit
  meaning, not overloading `onSelect`.
  (`client/src/components/severity/SeverityPills.tsx:35`)
- 2026-09-23 — the severity filter has TWO controls writing the same
  `?severity=` URL state (the pills, and `SeverityFilterButtons` below them),
  and this is deliberate, not leftover duplication: pills render only
  severities the run actually has, so without the always-three buttons there
  is no way to select a severity with zero findings and see the "no findings
  match" empty state. Deleting either control silently removes a reachable
  state. (`client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:77`)
- 2026-09-23 — SUPERSEDES the entry directly above, after seeing it rendered:
  two controls bound to one piece of state are read as a bug, however sound
  the argument for each. On screen it was a row of pills `CRITICAL 3 ·
  WARNING 1` stacked on a row of buttons `Critical / Warning / Suggestion`,
  both lighting up together. There is now ONE control inside a review run —
  `SeverityFilterButtons`, one chip per severity the run HAS, as
  `icon + label + count`, acting as counter and filter at once; `SeverityPills`
  is not rendered there any more (it stays for the PR list and Timeline, which
  have no list to filter). The reachability argument that justified keeping
  both — being able to pick a zero-count severity and see the empty state —
  was not worth a duplicated row. General lesson for this panel: whenever two
  components read the same URL param, check what they look like side by side
  before defending the split on paper.
  (`client/src/components/severity/SeverityFilterButtons.tsx:28`)
- 2026-09-23 — the Run Review menu deliberately has NO "Run all enabled agents"
  row any more, only the checkbox picker with `Select all`. Keeping both was
  considered and rejected: the row and the boxes carry DIFFERENT semantics —
  the row means "whatever the server considers enabled when it reads it", the
  boxes mean "these exact ids" — so they visibly disagree the moment a user
  unticks one while the row still promises "all". That is the same trap the
  two 2026-09-23 entries above record for `SeverityPills` +
  `SeverityFilterButtons`; this feature applied the lesson up front instead of
  shipping and reverting. The lost one-click path is recovered by seeding the
  selection with the enabled agents, so "run everything" is still one click.
  Related invariant worth not re-deriving: an explicitly picked agent runs even
  when disabled — `enabled` governs what starts TICKED (and what a legacy
  `all: true` resolves to), never what a user is allowed to run.
  (`client/src/app/repos/[repoId]/pulls/[number]/_components/RunReviewDropdown/helpers.ts:17`,
  `client/specs/multi-agent-selection.md`)

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
- 2026-09-23 — precise anchors for the three 2026-09-21 entries above, which
  cited a file but no line (every entry needs `file:line` so the evidence can
  be checked without re-reading the whole file): the portal escape hatch is
  `createPortal` at (`client/src/components/severity/FindingsPopover.tsx:68`)
  with the `position: "fixed"` anchorRect application at `:75`; the
  capture-phase scroll listener and its 150 ms close debounce are
  (`client/src/components/severity/useFindingsPopoverAnchor.ts:59`) and `:8`
  (`CLOSE_DELAY_MS`); the `.next` vendor-chunk poisoning was hit on the PR
  detail route at (`client/src/app/repos/[repoId]/pulls/[number]/page.tsx:66`),
  where the `?severity=` URL state is parsed.
- 2026-09-23 — React's "Updating a style property during rerender
  (borderColor) when a conflicting property is set (borderLeftColor)" warning
  fires even when the style object contains NO `border` shorthand, because
  `borderColor` and `borderWidth` are themselves shorthands for all four
  sides — so `borderColor` + `borderLeftColor` is already the forbidden mix.
  The existing comment in this file said "all-longhand (never mix `border`
  with `borderLeft`)" and still tripped the warning, i.e. the trap is
  specifically that `borderColor`/`borderWidth` LOOK like longhands. Whenever
  one side of a border differs, write all four sides explicitly
  (`borderTopColor`/`borderRightColor`/`borderBottomColor`/`borderLeftColor`);
  `borderStyle` may stay shorthand only while no `border*Style` competes with
  it. It surfaces only when the shorthand's value CHANGES on rerender — here
  `focused` flipping `borderColor` — so a static conflicting pair sits silent
  until someone makes it dynamic, and vitest/jsdom never reports it (the
  warning comes from the Next dev overlay, not from React DOM in tests).
  (`client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/styles.ts:9`)

## Session Notes

## Open Questions
