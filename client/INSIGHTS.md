# INSIGHTS.md — @devdigest/web

Append-only. Read before starting work in this package. Updated by the
`engineering-insights` skill — only when a session learns something
non-obvious; never rewritten, only appended to.

## What Works

## What Doesn't Work

## Codebase Patterns

- 2026-09-21: Card components here take their affordances as OPTIONAL handlers
  (`SkillCard`'s `onToggle`/`onDelete`, `AgentCard`'s `onToggle`), so a second
  call site that omits one silently renders a card with no toggle and no delete —
  and `tsc` cannot catch it, because omitting an optional prop is legal. This bit
  `SkillCard`, which has two call sites: the `/skills` grid and the `/skills/:id`
  rail. After adding a control to one, grep for every `<SkillCard` /
  `<AgentCard` and decide per call site rather than assuming the component
  "has" the control.

## Tool & Library Notes

- 2026-09-21: `innerText` (and therefore agent-browser `wait --text` and any
  text-matching assertion that goes through it) returns text with CSS
  `text-transform` APPLIED. A label styled `textTransform: "uppercase"` renders
  as "Skill body (Markdown)" but reads back as "SKILL BODY (MARKDOWN)", so an
  e2e step matching the source string silently never fires. Anchor e2e text
  waits on untransformed copy. (`textContent` is unaffected — this only bites
  the innerText-based paths.)
- 2026-09-21: `fflate`'s `unzipSync(data, { filter })` calls `filter` for every
  member but only inflates the ones it accepts. That makes a rejecting filter
  the way to ENUMERATE an archive's contents without decompressing any of it —
  used in `ImportSkillDrawer/helpers.ts` to list the entries we refuse to read
  (scripts, binaries) while inflating only the single skill document.
- 2026-09-21: After editing a GLOBAL file (`vendor/ui/styles.css`, a shared
  `vendor/ui` primitive), a long-lived `next dev` tab can wedge: client-side
  navigation lands on a page stuck at its loading skeletons, with **no console
  error**, the API returning 200, and the route's chunk never attached. It looks
  exactly like a broken query — it isn't. A brand-new tab (full document load)
  renders fine. Confirm with a fresh tab before debugging the component, and
  note that a hard reload of the wedged tab is not always enough.

- 2026-09-20: React's `onMouseEnter`/`onMouseLeave` are synthesized from native
  `mouseover`/`mouseout` (EnterLeaveEventPlugin), not from native
  `mouseenter`/`mouseleave`. `fireEvent.mouseEnter`/`mouseLeave` in RTL tests
  silently fail to trigger these handlers — use `fireEvent.mouseOver`/`mouseOut`
  instead (see `vendor/ui/kit/Popover.test.tsx`,
  `components/findings-severity-icons/FindingsSeverityIcons.test.tsx`).

## Decisions

- 2026-09-20: `vendor/ui/kit` has no hover-triggered popover/tooltip and no
  portal infrastructure (`Modal`/`Dropdown` are both portal-free, positioned
  via CSS `position: absolute` on a relatively-positioned wrapper). The new
  `Popover` primitive follows the same no-portal convention; to render inside
  an `overflow: hidden` ancestor (e.g. the PR list's `s.tableCard`) it takes a
  `strategy="fixed"` mode that reads the trigger's `getBoundingClientRect()`
  and positions with `position: fixed` instead of relying on ancestor CSS.
- 2026-09-20: The PR list's Findings column (like `score`/`cost_usd`) reflects
  only the PR's LATEST review — an older review with real findings won't show
  if a newer, cleaner review superseded it. By design (matches existing
  score/cost aggregation in `pulls/routes.ts`), but easy to mistake for a bug
  during manual QA when a PR has multiple reviews of very different quality.

## Recurring Errors & Fixes

- 2026-09-21: The app declared **no `color-scheme`** anywhere, so in dark mode a
  native `<select>` popup was drawn light by the OS while its `<option>`s
  inherited the select's near-white `--text-primary` — white on white, unreadable.
  The CLOSED control looks perfectly fine (the wrapper div supplies
  `--bg-elevated`), so this only reproduces once the dropdown is open, and never
  in a screenshot — the popup is an OS surface. Fixed at the token level in
  `vendor/ui/styles.css` (`color-scheme: dark` / `light` per `[data-theme]`) plus
  explicit `background`/`color` on each `<option>` in `kit/SelectInput.tsx`.
  Anything else the UA paints itself (scrollbars, date pickers) was equally
  affected — reach for `color-scheme` before restyling a native control.

## Session Notes

- 2026-09-20: Before implementing a UI feature, check `git status` for
  untracked component directories under the relevant route — this repo had a
  fully-written but unwired `SeverityCounters` component (untracked) sitting
  ready to be finished (it called `SeverityBadge` with `onClick`/`active`
  props the primitive didn't support yet). Building on it instead of writing
  a parallel implementation avoided duplicate work.

## Open Questions
