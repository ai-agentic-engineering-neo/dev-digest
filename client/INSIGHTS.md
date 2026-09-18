# Insights — client

Non-obvious findings and gotchas. Add an entry whenever something surprised
you, so the next agent/session doesn't relearn it.

## Codebase Patterns

- **2026-09-17** — `client/src/components/<name>/` (cross-route shared
  components not tied to one page, e.g. `diff-viewer/`, `page-shell/`,
  `app-shell/`, `run-cost-badge/`) use kebab-case directory names — unlike
  route-local `_components/<Name>/` under `app/`, which use PascalCase.
  Evidence: `client/src/components/run-cost-badge/RunCostBadge.tsx:1`.
- **2026-09-18** — A dead `PrRowView` interface in `client/src/lib/types.ts`
  (unused, never constructed anywhere) had a `findings: { CRITICAL; WARNING;
  SUGGESTION }` field years before the findings-by-severity feature existed
  — confirming it was pre-seeded scaffolding for exactly this feature, and a
  reliable source for the wire shape to reuse. Worth checking `lib/types.ts`
  for unused view-model interfaces before designing a new field's shape from
  scratch. Evidence: `client/src/lib/types.ts:37-48`.
- **2026-09-18** — No Tooltip/Popover/portal component existed anywhere in
  `client/src` before the findings-by-severity popover
  (`components/findings-by-severity/SeverityFindingsPopover.tsx`) — the PR
  list's `tableCard` has `overflow: hidden` (`pulls/styles.ts`), which would
  clip a naive `position: absolute` popover the way `vendor/ui/kit/Dropdown.tsx`
  does it. `createPortal(node, document.body)` + `position: fixed` from
  `getBoundingClientRect()` avoids the clipping, but then click-outside
  detection needs refs to BOTH the trigger and the portaled panel (they're no
  longer DOM-nested) — a single `ref.contains()` check, as `Dropdown.tsx`
  uses, silently breaks once a portal is involved.
  **Extended 2026-09-18** — `vendor/ui/kit/Dropdown.tsx` now has the same
  fix, because the PR list's Actions column mounts a dropdown inside that
  same `overflow: hidden` `tableCard`. The failure mode is worth naming
  precisely: with the menu portaled, `mousedown` on a menu ITEM is "outside"
  the trigger ref, so the handler closes the menu and React unmounts the
  item **before** its own `click` ever fires — the item silently never runs,
  and nothing errors. Fix is a second `menuRef` checked alongside the
  trigger ref, exactly as `SeverityFindingsPopover`'s `panelRef` does. The
  regression test has to fire `mouseDown` then `click` in that order; a bare
  `fireEvent.click` passes even with the bug. Also note the portaled menu
  must be `position: fixed` from the trigger's `getBoundingClientRect()` —
  it has no offset parent any more, so the in-place `position: absolute` +
  `top: calc(100% + 6px)` styling silently lands at the top of the page.
  Evidence: `client/src/vendor/ui/kit/Dropdown.tsx:78-100`,
  `client/src/vendor/ui/kit/Dropdown.test.tsx:60`.

- **2026-09-18** — "Always red" review verdicts on the demo PR are **seed data,
  not a binding bug**: `server/src/db/seed.ts:142` inserts exactly one review,
  hardcoded `verdict: 'request_changes'`, for the one demo PR, and no
  `agent_runs`/`run_traces` rows at all. `ReviewRunAccordion.tsx` /
  `RunHistory.tsx` were already fully data-driven. Don't go hunting for a
  colour-binding bug in the client when every locally-visible run reads red —
  check what `seed.ts` actually inserts first. (The one real colour bug there
  *was*: a local `VERDICT_COLOR` map in `ReviewRunAccordion.tsx` that disagreed
  with `VerdictBanner/constants.ts`'s `VERDICT_META` for the same verdict; now
  deduped to the single `VERDICT_META` source of truth.)
- **2026-09-18** — `RunHistory.tsx` / `ReviewRunAccordion.tsx` deliberately
  count blockers as **CRITICAL and non-dismissed, recomputed live** from the
  matched `ReviewRecord.findings`, not the denormalized `run.blockers` column.
  `run.blockers` is frozen at run completion *and* gated by that agent's own
  `ciFailOn` threshold, so it drifts from the accordion the moment a finding is
  dismissed, and can disagree with it outright for a non-CRITICAL gate. The
  frozen column survives only as the fallback for rows with no matching review
  (failed/cancelled/running). One `liveBlockers()` value feeds **both** the
  outcome colour and the printed "· N blockers" text so a row can never
  contradict itself. Evidence:
  `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx:34`.

## What Doesn't Work

- **2026-09-18** — `vendor/ui/primitives/Button.tsx`'s `active` prop is
  completely dead for `kind="secondary"`/`"ghost"` — only `kind="tertiary"`'s
  entry in the `kinds` style map actually reads it
  (`client/src/vendor/ui/primitives/Button.tsx:51-55`). `FindingCard.tsx` passed
  `active={accepted}`/`active={dismissed}` to `secondary`/`ghost` buttons for
  a long time with zero visual effect. Fix at the call site with a `style`
  override (Button spreads `style` last, so it always wins) rather than
  relying on `active` for these two kinds.
- **2026-09-18** — Overriding a shared `Button`'s border with longhand
  `{ borderStyle, borderColor, borderWidth }` in a conditionally-applied
  `style` prop triggers a persistent React dev-mode console warning
  ("Removing/Updating a style property... when a conflicting property is set
  (border)...") on every render where the override toggles on/off, because
  `Button.tsx`'s own `base` style sets the shorthand `border: "1px solid
  transparent"` (`client/src/vendor/ui/primitives/Button.tsx:37`).
  Cosmetic only — no visual bug observed — but expect the
  warning; fixing it for real means restructuring `Button.tsx`'s base style
  to longhand throughout, which is a shared-component change, not a
  per-caller one. `FindingCard/styles.ts`'s pre-existing `card()` function
  has the same class of mixing (`borderColor` + `borderLeftColor` together),
  unrelated to any single feature — this isn't new, just newly triggered by
  an interaction that re-renders with the override toggling.
- **2026-09-18** — Installing new devDependencies in `client/` via `pnpm add`
  can hit `ERR_PNPM_IGNORED_BUILDS` for a transitive native binary
  (`unrs-resolver`, pulled in by `eslint-config-next`) — pnpm's
  build-approval gate blocking its postinstall script. The package still
  installs and the tool (`eslint`) still works; this is a warning-level
  gate, not a failure — verify with `ls node_modules/.bin/<tool>` before
  assuming the install failed. Same underlying mechanism as the
  esbuild-arch-mismatch class of issue; see
  `reviewer-core/INSIGHTS.md`/`.claude/skills/esbuild-arch-mismatch/SKILL.md`. Evidence: the build
  allowlist `client/pnpm-workspace.yaml:4` (`unrs-resolver: false`).
- **2026-09-17** — A naive `abs.toFixed(6)` for rounding a USD-cost string
  mis-rounds real binary-float inputs at exact `x5` boundaries (e.g.
  `0.0000135` is actually stored as `...499999999995`, so `toFixed(6)` rounds
  DOWN instead of up). Fix: round via a scaled integer
  (`Math.round(abs * 1e6)`) instead of `toFixed`. Even that needs an explicit
  `>= 1e6` carry check — a value just under 1 (e.g. `0.9999999`) can round up
  to exactly `1e6` and silently render as `"$0.100"` instead of `"$1.00"`,
  because `padStart(6, "0")` can't shrink an already-7-digit string. Caught
  by an independent code review, not by the original test suite (which only
  covered values ≤ 0.013). See `client/src/lib/cost.ts:21-26`.
- **2026-09-18** — In Zod 3 (3.25.76 here), `z.boolean().optional().default(false)`
  produces an inferred type where the key is **required**, not optional:
  `z.infer` is the OUTPUT type, and `ZodDefault` strips `undefined`. So adding
  such a field to a shared contract (e.g. `RunSummary.has_trace` in
  `src/vendor/shared/contracts/trace.ts`) still breaks `pnpm typecheck` on every
  existing object-literal test fixture — exactly what `.default()` was reached
  for to avoid. Verified empirically by compiling a one-line probe inside the
  real `tsconfig.json`: `Property 'b' is missing ... but required in type
  '{ a: string; b: boolean; }'`. Use plain `.optional()` when the goal is "old
  fixtures keep compiling"; reserve `.default()` for when you genuinely want a
  required output value. Evidence:
  `client/src/vendor/shared/contracts/trace.ts:119`.

- **2026-09-18** — **Supersedes** the "Overriding a shared `Button`'s border
  with longhand" entry above: both React style-conflict warnings are now
  gone. (1) `FindingCard/styles.ts` `card()` sets per-side
  `borderTop/Right/BottomColor` instead of `borderColor` — `borderColor` is
  itself a shorthand, so toggling it on focus beside `borderLeftColor`
  warned. (2) `pressedBorder` uses `outline` instead of border longhands, so
  it never conflicts with `Button.tsx`'s `border` shorthand — no shared
  component change needed. For a conditional highlight on a vendored
  primitive, reach for `outline`/`boxShadow`, not border properties.
  Evidence:
  `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/styles.ts:9-15`
  (`card()`) and `:72-75` (`pressedBorder`).

- **2026-09-18** — `PrMeta.id` is `z.string().nullish()`
  (`src/vendor/shared/contracts/platform.ts:167`), and `PRRow.test.tsx`'s
  shared `pr()` fixture omitted it entirely. That mattered more than it
  looks: the new Actions cell is guarded on `pr.id`, so every existing test
  in the file kept passing while the cell rendered **nothing** — the
  `RunReviewDropdown` was never mounted, so the predicted "missing
  `useRunReview`/`useAgents` mocks will throw" breakage never surfaced and
  would have shipped an untested column. When adding a conditionally-rendered
  cell, add the field it is guarded on to the shared fixture first, then
  confirm the new assertions actually fail without the change. Evidence:
  `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.test.tsx:24`.
- **2026-09-18** — `vi.mock()` keys on the RESOLVED module, not the literal
  specifier: `vi.mock("../../../../../../lib/hooks/reviews", …)` in
  `PRRow.test.tsx:18-21` also mocks the `@/lib/hooks/reviews` import that the
  (differently-located) `RunReviewDropdown` uses, because the tsconfig alias
  resolves both to the same file. So one factory must export every hook BOTH
  call sites need (`usePrReviews` **and** `useRunReview`) — a factory that
  covers only its own component's hooks leaves the other one `undefined` at
  call time, with a "not a function" throw far from the mock.
- **2026-09-18** — The PR list's column order lives in THREE places that
  have no compile-time link: `COLUMN_KEYS` (header labels), `GRID` (the
  CSS grid tracks), and `PRRow.tsx`'s hand-ordered JSX cells. Nothing fails
  loudly if they drift — the table just renders each cell under the wrong
  header at the wrong width. Guarded now by two cheap tests (a `:nth-child`
  position assertion per `data-testid` cell, and `GRID.split(/\s+/).length
  === COLUMN_KEYS.length`), plus `:nth-child` assertions in e2e flow 02.
  Evidence: `client/src/app/repos/[repoId]/pulls/constants.ts:27`.
- **2026-09-18** — `next-intl` accepts an **empty-string** message value
  (`list.columns.actions: ""`) — it throws only on a genuinely missing key.
  That is the clean way to give a table a header-less column without
  special-casing the header `map`. Evidence:
  `client/messages/en/prReview.json:97` (`list.columns.actions`).
- **2026-09-18** — The "Last synced" label is **unreachable on seeded data**:
  `repos.last_polled_at` has no DB default (`server/src/db/schema/repos.ts:17`)
  and `seed.ts` never sets it, so it is `null` until someone actually clicks
  Refresh. Any e2e flow asserting that text would have to trigger a real
  refresh — which enqueues a live `git clone` and breaks the read-only
  contract every flow here relies on. Covered by `FilterBar.test.tsx`
  instead; noted in flow `09-pr-list-actions.flow.json`'s description.
- **2026-09-18** — **Supersedes the "Always red … seed data" entry above —
  that diagnosis was incomplete.** `reviews.verdict` is the model's
  SELF-REPORTED verdict, written before citation-grounding drops findings it
  can't anchor to the diff. So a real run can persist
  `verdict: "request_changes"` with **0 surviving findings and score 100**
  (its summary still describing the CRITICAL it no longer has), while the
  Timeline — which derives its outcome from actual findings — correctly says
  "approved". Never render `review.verdict` directly: derive it with
  `effectiveVerdict()` (active CRITICAL → request_changes, other active →
  comment, none → approve), the same rule as the Timeline's `outcomeOf`.
  Evidence: `client/src/lib/findings.ts:19-29`,
  `client/src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx:99-102`.
- **2026-09-18** — For a quiet table-row action with a hover highlight, use
  the shared `Button`'s `kind="ghost"` rather than a hand-rolled `<button>`:
  it is already transparent + muted with a `var(--border)` outline at rest and
  switches to `var(--bg-hover)` + `var(--text-primary)` on hover (via its own
  `onMouseEnter` state, since `:hover` can't live in a style object). The PR
  list's Actions column first shipped an icon-only custom trigger to save
  width; the design wants the labelled "Run Review ⌄", which fits a 140px
  track. Evidence: `client/src/vendor/ui/primitives/Button.tsx:56,63`,
  `client/src/app/repos/[repoId]/pulls/constants.ts:29`.
- **2026-09-18** — The PR-detail URL's `agent`/`severity` pair has exactly
  ONE writer: `FindingsTab`'s `writeUrl`, which records what it last wrote in
  `urlRef`. Anything that needs to know "does the URL currently hold another
  run's severity?" (e.g. merely expanding an accordion) must read `urlRef`, not
  infer it from `target`/`appliedByRunId` — the severity PILLS write the URL
  without touching either (they must not: bumping `appliedByRunId` remounts
  the panel). And a pill change is reported via `onSeverityFilterChange` only
  on USER action, never on mount, or a deep-linked panel would re-write its own
  URL on arrival. Evidence:
  `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx:103-113`.
- **2026-09-18** — "Review runs" stayed stale after an agent finished (only
  the Timeline updated) because the reviews refetch hung off RunStatus's SSE
  `onDone`, and RunStatus is only MOUNTED while the 4s active-runs poll is
  non-empty (`FindingsTab.tsx:199,222`): the poll usually empties first,
  RunStatus unmounts, and `onDone` never fires. Never hang a refetch off a
  component whose own lifetime is controlled by the same data you're waiting
  on — key it off the data instead: `useRefreshWhenRunsSettle` diffs the
  active-run ids and invalidates reviews / pr-runs / pull / pulls when any
  leaves the set (it ignores `undefined` loading states). Safe because the
  server persists the review BEFORE marking the run done. Evidence:
  `client/src/lib/hooks/reviews.ts:49`,
  `client/src/app/repos/[repoId]/pulls/[number]/page.tsx:59`.
