# client — insights

Traps found while working here. Newest first, one entry per trap.
Format: date · symptom · cause · rule.

Appended by the `engineering-insights` skill: append-only, never rewritten.

## What Works

Approaches and solutions that held up here.

## What Doesn't Work

Dead ends and antipatterns. The most frequently skipped section and the most
valuable one.

- **2026-09-19 — Mixing the `border` shorthand with a `borderColor` override is a runtime error in dev.**
  A style object with `border: "1px solid transparent"` whose active variant
  overrides only `borderColor` makes React log, the moment the variant turns
  OFF: "Removing a style property during rerender (borderColor) when a
  conflicting property is set (border) can lead to styling bugs." It fires on
  the toggle-off, not the first render, so a component can look fine until a
  user clicks twice — a unit test that renders both states separately will not
  catch it either. `FindingCard/styles.ts:7` already carries this rule as a code
  comment; it is written here because a code comment in one component does not
  reach the next component.
  Rule: any style whose variant changes ONE border facet is all-longhand —
  `borderWidth` / `borderStyle` / `borderColor`, never `border`.
  `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsSummary/styles.ts`

- **2026-09-19 — Re-exporting a shared helper through a page-local `helpers.ts` breaks the dev server.**
  Moving `lineLabel` into `src/components/findings-preview` and leaving
  `FindingCard/helpers.ts` as `export { lineLabel } from "..."` compiled clean
  under `tsc` and vitest, but the Next dev server kept logging "Attempted import
  error: 'lineLabel' is not exported from './helpers'" — through the package
  barrel AND through the concrete module. The page still rendered, so nothing
  but the browser console showed it.
  Rule: when a page-local helper becomes shared, move it and update the call
  sites to import the shared module directly — do NOT leave a re-export shim
  behind to preserve the old import path.
  `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx:22`
  Confidence: low (cause not isolated from dev-server HMR staleness)

- **2026-09-19 — A `position: absolute` hover card in the PR list is clipped away.**
  `s.tableCard` sets `overflow: "hidden"` (`pulls/styles.ts:91-97`), so a popover
  absolutely positioned inside a row is cut off at the table's edge — it does not
  overlay the page, it disappears. The working shape is `position: fixed` with
  coordinates taken from the anchor's `getBoundingClientRect()` on mouseenter and
  clamped against the viewport (including flipping ABOVE the anchor for rows near
  the bottom, or the last rows open a card nobody can read).
  Second constraint that looks removable and is not: the card must stay a DOM
  CHILD of the element that opens it. Portal it elsewhere and moving the pointer
  onto the card fires the anchor's `mouseleave`, so the card closes as you reach
  for it. Fixed positioning gives the visual escape; DOM containment gives hover
  stability — they are separate problems.
  Rule: any hover card inside a list row or timeline row is `fixed` + rect-anchored
  + rendered inside its anchor.
  `client/src/components/findings-preview/{styles.ts,helpers.ts}` (`anchorFor`)

## Codebase Patterns

Conventions and structural decisions a newcomer would otherwise re-derive.

- **2026-09-23 — Visiting `/repos/:id` does NOT make that repo the active one elsewhere.**
  `RepoProvider` reads the repo from the URL path first, but only `setRepoId` (the
  sidebar switcher) writes `localStorage["dd-repo"]`. So `/skills`, `/agents` and
  `/settings/*` in a fresh browser profile show the FIRST repo from the API
  (`acme/payments-api` in the seed) even right after a `/repos/<other>/…` page.
  Rule: in e2e/demo scripts that visit off-path pages, set
  `localStorage.setItem('dd-repo', <id>)` first; do not count on a prior `/repos/:id` visit.
  `client/src/lib/repo-context.tsx` (`setRepoId`, `repoId = fromPath ?? stored ?? list[0]`)

- **2026-09-22 — `Markdown` (`@devdigest/ui`) only styles `p`/`strong`/`code`/`a` — headings and lists render as flat, undifferentiated text.**
  `src/vendor/ui/primitives/Markdown.tsx`'s `react-markdown` `components` map
  overrides just those four tags. Nothing overrides `h1`-`h6`/`ul`/`ol`/`li`, and
  Tailwind's preflight (`src/vendor/ui/styles.css:205-211`, `h1,h2,h3,h4,p {
  margin: 0 }`, plus Tailwind's own heading/list resets) zeroes their font-size,
  font-weight and list markers — so a skill body's `## Heading` and bullet list
  render at body-text size with no visual hierarchy at all (looked like plain
  wrapped paragraphs, not "a markdown viewer").
  `Markdown.tsx` is under the do-not-touch `src/vendor/ui/**`, so the fix is NOT
  editing it — add CSS scoped to the `.dd-md` wrapper class it already applies
  (`className="dd-md"`, `Markdown.tsx:9`) in `client/src/app/globals.css`
  instead. This is also the right place because it fixes every consumer at
  once (`SkillDetail`'s `PreviewTab` AND `components/diff-viewer/CommentCard`),
  not just the one screen you're working on.
  Rule: when a `Markdown`-rendered block looks under-styled, check whether the
  gap is in `Markdown.tsx`'s tag coverage first — extend via `.dd-md { ... }`
  rules in `globals.css`, never by editing the vendored component.
  `client/src/vendor/ui/primitives/Markdown.tsx`, `client/src/app/globals.css`

- **2026-09-22 — `src/vendor/ui/nav.ts` is config, not vendored component code: it IS meant to be edited despite sitting under the do-not-touch `src/vendor/ui/**` path.**
  Root/client `CLAUDE.md`'s do-not-touch list names `src/vendor/ui/**` wholesale,
  but `nav.ts` (`NAV`/`SHORTCUTS`/`resolveHref`) is a plain data registry the
  file's own comment says is finished by a later lesson ("Keyboard shortcut
  registry. Wiring is finalized by A6."), not a rendered component. Adding a nav
  group + a `g <key>` shortcut needed ONLY a `nav.ts` edit — `useGlobalShortcuts`
  (`components/app-shell/hooks/useGlobalShortcuts.ts`) already resolves the
  target generically via `NAV.flatMap((g) => g.items).find((it) => it.gKey ===
  e.key)`, and `useShellCommands` builds the command-palette entry the same way,
  keyed off `shell.nav.<item.key>` in `messages/en/shell.json` (already staged
  there as a placeholder for `skills`).
  Rule: a new nav item/shortcut is a `nav.ts` data edit only — do not add
  per-shortcut handler code, and check `messages/en/shell.json`'s `nav.*` keys
  before adding a new one (a placeholder is often already there).
  `client/src/vendor/ui/nav.ts`, `client/src/components/app-shell/hooks/useGlobalShortcuts.ts`

- **2026-09-21 — PR-detail components are nested by consumer; older entries' paths are stale (supersedes their paths, not their rules).**
  Under `pulls/[number]/_components/`: `FindingsTab/_components/{RunStatus,RunHistory,FindingsSummary,ReviewRunAccordion}`,
  `ReviewRunAccordion/_components/{FindingsPanel,VerdictBanner}`,
  `FindingsPanel/_components/FindingCard`, `PrDetailHeader/_components/RunReviewDropdown`.
  Entries of 2026-09-19 that cite `_components/FindingCard/…` or
  `_components/FindingsSummary/styles.ts` mean these nested locations.
  `SEVERITY_ORDER` moved out of `FindingsPanel/constants.ts` to `src/lib/severity.ts`
  because the route's `?severity=` parsing (`PrDetailView/helpers.ts`) and the panel both
  need it and a parent may not import a grandchild's internals.
  Rule: a constant needed by a route helper AND a nested component goes to `src/lib/`.
  `client/src/lib/severity.ts`

- **2026-09-21 — `@devdigest/ui` `Modal` is not portaled: clicks inside it bubble to the parent that renders it.**
  `Modal` is a `position: fixed` div rendered in place, so a dialog rendered
  inside a clickable card (`AgentCard`) or accordion header
  (`ReviewRunAccordion`) sends every click in it up to that parent's `onClick`
  — a "Cancel" would also navigate or toggle the row. `ConfirmDialog` wraps the
  Modal in a `stopPropagation` div for this reason; a new overlay built on
  `Modal` needs the same.
  Rule: render `{dialog}` from `useConfirm()` wherever convenient, but any other
  `Modal` placed under a clickable ancestor must stop click propagation itself.
  `client/src/vendor/ui/kit/Modal.tsx`, `client/src/components/confirm-dialog/ConfirmDialog.tsx`

- **2026-09-21 — `messages/*.json` sits outside `src/`, so `@/` cannot import it; use `@messages/…`.**
  Tests import the real bundle (`messages/en/prReview.json`) to fail on a missing
  i18n key, and 20 of the 52 deep `../../../` imports were exactly that. `@/*`
  maps to `./src/*`, so those needed their own alias: `@messages/*` →
  `./messages/*` in `tsconfig.json` `paths` AND `vitest.config.ts`
  `resolve.alias` (both — tsc and vite resolve separately, and only one of them
  failing is easy to miss).
  Rule: import message bundles as `@messages/en/<ns>.json`, never with a
  relative `../` chain; a new alias goes in both config files.
  `client/tsconfig.json`, `client/vitest.config.ts`

- **2026-09-19 — In `FindingsTab`, `runs` are REVIEWS and `prRuns` are runs.**
  The prop named `runs` holds `ReviewRecord[]` (`/pulls/:id/reviews`, findings
  embedded); the actual `agent_runs` rows are `prRuns` (`RunSummary[]`). So
  `<RunHistory runs={prRuns} reviews={runs} />` is CORRECT despite reading like
  swapped arguments — do not "fix" it. The two are matched by `run_id`, which is
  also the only key between them: `RunSummary` carries just `findings_count` and
  `blockers`, never a severity breakdown, so per-run severity data is derived on
  the client from reviews already loaded — no extra request, and none needed.
  `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx`

- **2026-09-19 — `<SeverityBadge compact>` drops the text label, leaving colour + icon.**
  The primitive's own comment promises "always icon + label (WCAG AA: never color
  alone)", but `compact` renders only the icon and the count — in a dense cell
  that is exactly the colour-only signal the comment forbids.
  Rule: a `compact` SeverityBadge must be wrapped in something carrying the
  severity in words (`title` / `aria-label`); use the non-compact badge wherever
  there is room.
  `client/src/vendor/ui/primitives/Badge.tsx:52-88`

- **2026-09-19 — A missing number renders as an em dash, never as `$0.00`.**
  Cost is absent for runs on unpriced models and for failed runs; `$0.00` would
  claim the run was free, which some models genuinely are. `formatUsd` encodes
  this: `null`/`undefined` → `"—"`, exact `0` → `"$0"`.
  Rule: route every USD value through `formatUsd` (and token counts through
  `formatTokenCount`) rather than formatting inline — the three cost surfaces
  (PR row, run timeline, trace drawer) live in different subtrees and drifted
  formatters is exactly how they stop matching.
  `client/src/lib/format.ts`, `client/src/lib/format.test.ts`

## Tool & Library Notes

Quirks of the dependencies this package pins.

- **2026-09-22 — `@devdigest/ui`'s exported `IconName` has "Edit", not
  "Pencil", even though `icons.tsx` imports lucide's `Pencil` by that name
  internally.**
  `icons.tsx` aliases it (`Edit: Pencil` — its own comment says "prototype
  used Edit; lucide exports Pencil/Edit; alias to keep API"), so
  `<Button icon="Pencil">` fails `tsc` with a long union-type error that
  doesn't obviously point at this rename; `"Edit"` is the only valid key.
  Rule: when an icon name guessed from the lucide/prototype name fails to
  typecheck, check `icons.tsx` for a rename before assuming the icon doesn't
  exist in the set at all.
  `client/src/vendor/ui/icons.tsx:146-147`

- **2026-09-22 — `@devdigest/ui`'s `Skeleton` has no `lines` prop — it renders exactly one bar.**
  It only accepts `width`/`height`/`style` (`primitives/Skeleton.tsx`);
  passing `lines={6}` (by analogy with other design systems' skeleton
  components) fails `tsc` as an unknown prop rather than silently no-op-ing.
  Rule: for a multi-line loading placeholder, render
  `Array.from({length: n})` of `<Skeleton>` yourself — there is no built-in
  repeat.
  `client/src/vendor/ui/primitives/Skeleton.tsx`

- **2026-09-22 — jsdom's `File` has no `arrayBuffer()`; use `FileReader.readAsArrayBuffer` instead.**
  A file-upload component that reads a chosen file's bytes via
  `file.arrayBuffer()` (e.g. to base64-encode it for an import-preview POST)
  works in a real browser but throws `TypeError: file.arrayBuffer is not a
  function` the instant a vitest+jsdom test fires a file input's `change` event
  with a `File` — jsdom's `File`/`Blob` implementation in this repo's pinned
  version does not implement the `arrayBuffer()` method, only the legacy
  `FileReader` API.
  Rule: read file bytes with `new FileReader().readAsArrayBuffer(file)`
  (wrapped in a Promise via its `onload`/`onerror`), never `file.arrayBuffer()`,
  for any component whose test fires a real file-input change event.
  `client/src/app/(shell)/skills/_components/SkillsView/_components/ImportSkillDrawer/helpers.ts`

- **2026-09-19 — `toFixed` rounds money the wrong way; `Intl` silently drops `minimumFractionDigits`.**
  `(0.0135).toFixed(3)` is `"0.013"` (0.0135 is stored as 0.013499…), so a cost
  would read a tenth of a cent low. `Intl.NumberFormat` fixes that, but once
  `maximumSignificantDigits` is set it IGNORES `minimumFractionDigits`, turning
  12.345 into `"$12"` and 0.5 into `"$0.5"` — both verified in node.
  Rule: scale-then-round (`Math.round(v * 10**d) / 10**d`) before `toFixed`, and
  do NOT swap `formatUsd` for `Intl.NumberFormat`.
  `client/src/lib/format.ts`

## Recurring Errors & Fixes

An error seen twice, plus the fix that actually worked.

- **2026-09-21 — Supersedes the low-confidence TS2344 entry below: stale `.next/types` is confirmed, and a rerun is NOT the fix after moving route folders.**
  After `git mv src/app/{agents,repos,settings,page.tsx} src/app/(shell)/`,
  `pnpm typecheck` failed with `.next/types/app/agents/page.ts: error TS2307:
  Cannot find module '../../../../src/app/agents/page.js'` (one per moved page).
  `tsconfig` includes `.next/types/**`, and `next typegen` only adds/overwrites —
  it leaves the old route's file behind, so rerunning changes nothing.
  Fix that worked: `rm -rf .next/types && pnpm exec next typegen` (generated
  output only, gitignored; not editing `.next/**` by hand), then typecheck is clean.
  Rule: after moving or renaming any `page.tsx`/route folder, regenerate the route
  types this way before trusting `pnpm typecheck`.
  `client/tsconfig.json` (`include`), `client/.next/types/`

- **2026-09-21 — Moving a component folder breaks `vi.mock("../../…/lib/hooks/x")` in its test, and `from "…"` greps do not see it.**
  Relative paths inside `vi.mock(...)` resolve against the test file, so after
  nesting `RunReviewDropdown` and `FindingsPanel` two levels deeper their mocks
  pointed at nothing: typecheck passed and 5 tests failed with "No QueryClient set,
  use QueryClientProvider to set one" (the real hook ran). A `grep 'from "\.\./'`
  audit misses these entirely.
  Rule: mock module paths with the alias (`vi.mock("@/lib/hooks/reviews", …)`,
  as `docs/ui-architecture.md` already shows) and, before a move, also grep
  `vi.mock\("\.`. The same error text means "a mock path went stale".
  `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/_components/ReviewRunAccordion/_components/FindingsPanel/FindingsPanel.test.tsx`

- **2026-09-21 — `pnpm typecheck` fails with TS2344 in `.next/types/validator.ts` right after a `page.tsx` is moved.**
  Literal text: `.next/types/validator.ts(86,52): error TS2344: Type '"/repos/[repoId]/pulls"' does not satisfy the constraint 'AppRoutes'.`
  Seen while `git mv page.tsx …/View.tsx` and re-creating a thin `page.tsx`: the
  first run failed, the identical rerun (no source change) passed. `tsconfig`
  includes `.next/types/**`, so a stale generated route list from an earlier dev
  run is type-checked against the new tree.
  Rule: on this error, rerun `pnpm typecheck` once before hunting in `src/`; do
  not edit `.next/**` (do-not-touch).
  `client/tsconfig.json` (`include`), `client/.next/types/validator.ts`
  Confidence: low (cause inferred, seen once)

## Session Notes

Dated summary, only when a session changed how this package is worked on.

## Open Questions

What was left unresolved, so the next session does not re-investigate blind.

- **2026-09-23 — The agent editor's "Run on a PR…" opens the FIRST repo's PRs, not the active repo's.**
  The button is `router.push("/")`, and `/` always `router.replace`s to
  `/repos/${repos[0].id}/pulls` (as `client/specs/pages.md` rule 1 describes), ignoring
  `localStorage["dd-repo"]`. With `Svyat90/dev-digest` active it lands on
  `acme/payments-api`. Unresolved: either `/` should honour the active repo, or the
  button should push `/repos/<activeRepoId>/pulls`.
  Rule: until fixed, reach a repo's PRs through the sidebar "Pull Requests" link, which
  follows the active repo.
  `client/src/app/(shell)/agents/[id]/_components/AgentEditorView/AgentEditorView.tsx:108`,
  `client/src/app/(shell)/page.tsx:19`

- **2026-09-21 — CLOSED: the `client/CLAUDE.md` vs `TESTING.md` test-policy conflict (entry of 2026-09-21 below).**
  `client/CLAUDE.md` now says tests are typological (`../TESTING.md`) and that a
  component folder without a `*.test.tsx` is not a defect. The workaround rule in
  the entry below is no longer needed; the entry itself is left as written.
  `client/CLAUDE.md` ("Non-default conventions")

- **2026-09-21 — `client/CLAUDE.md` and `TESTING.md` disagree on whether every component gets a test.**
  `client/CLAUDE.md` says each `_components/<Name>/` folder has "its own
  `*.test.tsx`"; `TESTING.md:8` says tests are "typological, not exhaustive". The
  code follows TESTING.md: 37 component folders under `src/app` and
  `src/components` have no test (for example `FindingsTab`, `PrDetailHeader`,
  `ConfigTab`, all of `diff-viewer/*`). An agent that follows the client file
  literally will add tests the policy does not want.
  Rule: until one of the two docs is corrected, follow `TESTING.md` — a missing
  test in a component folder is NOT a defect to fix.
  `client/CLAUDE.md` ("Non-default conventions"), `TESTING.md:8`
