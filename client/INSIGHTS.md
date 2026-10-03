# Insights

Non-obvious findings, decisions, and lessons learned while working in
`client/` that aren't already captured in [CLAUDE.md](CLAUDE.md) or
[README.md](README.md). Populated by the `engineering-insights` skill.
Append-only — add new dated entries, never edit or remove existing ones.

<!-- ### YYYY-MM-DD — short title
What was surprising, and why it matters. -->

## What Works

## What Doesn't Work

## Codebase Patterns

### 2026-09-20 — one formatter, reused across a dedicated badge and a bare stat tile
`run-cost-badge/RunCostBadge.tsx:13` (`formatRunCost`) is the single source
of truth for rendering a run's cost: `PRRow.tsx:63` and `RunHistory.tsx:202-204`
use it via the `<RunCostBadge>` component (`RunCostBadge.tsx:27`,
compact/timeline variants), but `RunTraceDrawer/_components/TraceBody/TraceBody.tsx:67`'s
Stats grid has no badge slot — it renders a bare `<Stat label val>` tile, so
it imports `formatRunCost` directly (`TraceBody.tsx:9`) instead of wrapping
`<RunCostBadge>`. When a value needs to render both inside a purpose-built
component AND inside a generic `label/val` tile elsewhere, export the
formatter standalone rather than forcing the second call site to use the
first's component wrapper.

### 2026-09-20 — a nullable numeric field renders "—", never "0.00"/"0"
`RunCostBadge.tsx:38` (`cost = costUsd != null ? formatRunCost(costUsd) :
null`) and `TraceBody.tsx:67` (`stats.cost_usd != null ? formatRunCost(...) :
"—"`) both treat `cost_usd: null` as "provider reported no usage/pricing"
and render `"—"` — never `"$0.00"`. This is a deliberate UI convention for
money-like fields on a run row (a run CAN legitimately cost exactly $0 in
theory, but in practice `null` always means "unknown", so the UI never
distinguishes the two) — worth reusing for any future per-run numeric stat
that can be genuinely absent.

### 2026-09-20 — lazy-fetch heavier per-row data on hover via a hook's `enabled` override, don't add an endpoint
The PR list's FINDINGS popover (`FindingsCell.tsx`) needs each finding's
full `rationale`/`confidence`/`category` — too heavy to embed in every list
row's response. Rather than a new endpoint or prefetching all PRs' findings
up front, `usePrReviews(prId, { enabled })` (`lib/hooks/reviews.ts:51-57`)
was extended with an optional second-arg override ANDed with the existing
`!!prId` check, and `FindingsCell` only sets `enabled: true` on
`onMouseEnter`. Zero new endpoints, zero payload bloat on the list, and
TanStack Query's own cache means re-hovering the same row after the first
hover is instant. The *counts* shown before any hover (the pill numbers)
still come from the list response itself (`PrMeta.findings_by_severity`,
server-aggregated) — only the full finding previews are lazy.

### 2026-09-21 — no floating-positioning library exists; `FindingsPopover` now hand-rolls flip-to-fit
`client/src/components/findings-popover/FindingsPopover.tsx` always opened
downward (`top: calc(100% + 6px)`, no collision detection) and got hard-clipped
by the PR list's `tableCard` (`pulls/styles.ts:86-92`, `overflow:"hidden"`)
for the LAST row — that container has no `maxHeight`/scroll of its own, so
its bottom edge sits right at the last row regardless of how much viewport
space is actually left below. A window-height-only check would have missed
this. Fixed by walking up for the nearest ancestor with a clipping `overflow`
(`helpers.ts`'s `findClipBoundary`) and falling back to the viewport only
when none exists — the two real call sites (`FindingsCell` inside
`tableCard`, `TimelineFindingsPills` in `RunHistory.tsx` with no clipping
ancestor at all) need genuinely different boundaries, confirmed by checking
both before deciding on window-only. `client/src/vendor/ui/kit/Dropdown.tsx`
has the identical unpatched bug — vendored/do-not-touch, left alone. No
`@floating-ui/react`/`@popperjs/core`/`@radix-ui` is installed anywhere in
`client/`; any future floating panel needing this will have to reuse (or
extract to `lib/`) `computeFlip`/`findClipBoundary` rather than expecting a
library to already handle it.

## Tool & Library Notes

### 2026-09-20 — `pnpm add` can leave `pnpm-workspace.yaml` with an invalid placeholder
Running `pnpm add -D eslint-config-next ...` (first time a package with a
new native postinstall script — `unrs-resolver` — entered the tree) had
pnpm auto-append `unrs-resolver: set this to true or false` to
`pnpm-workspace.yaml`'s `allowBuilds` map — a literal placeholder STRING,
not an actual boolean, left for the human to resolve. `eslint`/`pnpm lint`
both ran fine without approving the build (prebuilt binary works), so
resolved to `unrs-resolver: false` rather than `true`. If a future `pnpm
add` reports "Ignored build scripts" and you don't immediately fix the
placeholder, `pnpm-workspace.yaml` is left in a not-quite-valid state —
check it after any install that mentions ignored builds.

### 2026-09-20 — two working spellings for the same shared-contracts import
`@devdigest/shared` and `@/vendor/shared` both resolve to
`src/vendor/shared/index.ts` (`tsconfig.json:23-25`) and both typecheck.
The established convention across the codebase (and `client/CLAUDE.md`) is
`@devdigest/shared`; `pulls/constants.ts:1` (`import type { PrMeta } from
"@/vendor/shared";`) uses `@/vendor/shared` instead — harmless today, but if
it spreads it'll make `@devdigest/shared` look optional when it's actually
the intended package-style alias.

## Recurring Errors & Fixes

### 2026-09-28 — a value import of `@devdigest/shared` needs `next.config.mjs`'s new `extensionAlias`
Every existing client hook only ever `import type`-ed contracts from
`@devdigest/shared` — type-only imports are erased before bundling, so
Next's bundler (webpack for plain `next dev`, and Turbopack too) never
actually had to resolve `src/vendor/shared/index.ts`'s real module graph.
That graph re-exports with explicit `.js` specifiers pointing at `.ts` files
(`export * from './contracts/findings.js'` etc., mirroring the server's
NodeNext-style ESM sources) — `tsc`/`tsx` resolve `.js`→`.ts` natively, but
neither of Next's bundlers do by default, so the very first *runtime* value
import (added in `src/lib/hooks/core.ts`/`reviews.ts` for response-schema
validation — `import { PrMeta, PrDetail } from "@devdigest/shared"`) broke
`next dev` with `Module not found: Can't resolve './contracts/findings.js'`
(webpack) / `The export ReviewRecord was not found ... module has no exports
at all` (Turbopack, after silently swallowing the same resolution failure
one level down). Fixed by adding `experimental.extensionAlias: {".js": [".ts",
".tsx", ".js"]}` to `client/next.config.mjs` — the officially-supported
webpack option for exactly this TS-ESM-with-`.js`-specifiers pattern; verified
against both `next dev` (webpack) and `next dev --turbo`. If a future change
adds another *value* (non-type) import from `@devdigest/shared` and the app
502s/500s only in the browser (typecheck/lint/vitest all stay green, since
none of those go through Next's bundler), check this first.

### 2026-09-20 — a stale `eslint-disable` comment is itself a lint error once ESLint exists
Adding ESLint for the first time surfaced `// eslint-disable-next-line
react-hooks/exhaustive-deps` at `ReviewRunAccordion.tsx:52` guarding a
`useEffect` whose deps array (`[targetRunId, targetNonce, review.run_id]`)
was already complete — the disable was stale (from an earlier version of the
deps array) and ESLint flags an unused-disable-directive as its own warning.
Removed rather than silenced further. When adding lint to a codebase that
had none, expect a handful of these — check each disable comment is still
covering a real violation, don't assume it's load-bearing.

### 2026-09-20 — an i18n key nested one level deeper than the `t()` call expects fails silently
Added `"findingsPopoverTitle"` to `messages/en/prReview.json` inside the
`list: {...}` block (next to `columns`), then called
`t("findingsPopoverTitle", {count})` in `FindingsCell.tsx` under
`useTranslations("prReview")` — next-intl doesn't throw or warn, it just
renders the literal key string `"prReview.findingsPopoverTitle"` verbatim
as the text. No TS error either (the `t()` signature doesn't validate key
paths against the JSON at this project's next-intl setup). Caught only by
a component test asserting the rendered title text. Fix was either moving
the JSON key up a level or (what was done) calling `t("list.findingsPopoverTitle",
...)` to match where it actually lives. When adding a new translated string,
write the render-assertion test FIRST or grep the exact nesting path back
out of the JSON before calling `t()` — don't trust the call site alone.

### 2026-09-20 — `mouseenter`/`mouseleave` don't bubble; `fireEvent` must target the exact listening element
`FindingsCell.tsx`'s hover popover uses `onMouseEnter`/`onMouseLeave` on its
outer wrapper `<div>`. In `FindingsCell.test.tsx`, `fireEvent.mouseEnter(el)`
only triggers the handler if `el` IS that exact div — these are non-bubbling
DOM events, so dispatching on a descendant (e.g. the text node's nearest
`<span>`) does nothing, silently. Used `screen.getByText(...).closest("div")`
to climb from a known descendant text node up to the actual listening
element. Don't reach for `fireEvent.mouseOver` as a bubbling substitute
either — it's a different event with different default browser semantics;
match the component's real handler name.

### 2026-09-20 — adjacent `{a}:{b}` JSX expressions are separate text nodes, breaking exact `getByText`
`{f.file}:{f.start_line}` (three sibling JS expressions in one JSX children
list) renders as three separate text nodes sharing a parent, so
`screen.getByText("src/config.ts:12")` fails ("text is broken up by multiple
elements") even though it reads correctly in the browser. Fixed by
interpolating into one JS string first: `` {`${f.file}:${lineLabel(f)}`} ``
(also picked up the existing `lineLabel()` helper from `FindingCard/helpers.ts`
for the single-line-vs-range formatting, instead of re-deriving it). Applies
to ANY adjacent-expression JSX text, not just this case — prefer one
template-string expression over multiple adjacent `{}`s whenever a test will
assert on the resulting text.

## Session Notes

### 2026-09-20 — added cost display across 3 views
COST column on the PR list (`PRRow.tsx:63`, `constants.ts:27,48` GRID/
COLUMN_KEYS), a `"N tok · $X"` line under each run's timestamp in the
agent-runs timeline (`RunHistory.tsx:202-207`), and a 4th COST `<Stat>` tile
in the run trace drawer's Stats grid (`TraceBody.tsx:67`), all backed by the
new `run-cost-badge/RunCostBadge.tsx` component. See `server/INSIGHTS.md`
for the backend half (schema + routes).

### 2026-09-20 — homework rubric requires more findings/severity UI than exists
Checked this session's work against a grading rubric (`hw1-criteria.md`,
criteria 16-23): the PR-detail "Agent runs" tab already has the required
Timeline/Review-runs split (`FindingsTab.tsx:126-166`) and Accept/Dismiss
buttons on finding cards (`FindingCard.tsx:91-112`, though labelled
"Dismiss" not literally "Reject") and the trace drawer already shows real
findings, not just stats (`TraceBody.tsx:72` → `FindingsSection.tsx:18-40`)
— but severity-count pills ("N CRITICAL · N WARNING · N SUGGESTION") with
toggleable Critical/Warning/Suggestion filter buttons do not exist anywhere
(`ReviewRunAccordion.tsx:143-151` only renders `VerdictBanner` + a plain
"hide low confidence" `Toggle` in `FindingsPanel.tsx:19,50-56`), and the PR
LIST page has no FINDINGS column or hover popover at all
(`constants.ts` `COLUMN_KEYS` has no `"findings"` entry). None of this was
in scope for the cost feature — recorded here so the next session doesn't
have to re-discover it from scratch.

### 2026-09-20 — added ESLint (`eslint-config-next` flat config) — 9 problems, all pre-existing
`eslint.config.mjs` uses `FlatCompat` to load `next/core-web-vitals` +
`next/typescript` (`eslint-config-next@15.1.12`, pinned to match the
installed `next@^15.1.3`, not the latest major). First `pnpm lint` run over
the whole package found 9 problems, all genuine and all fixed same session:
an `<a>` that should've been `next/link` (`AddRepoView.tsx`), 3×
`@typescript-eslint/no-explicit-any` on a mutation-result prop type
(`FindingsTab.tsx:20` — fixed via `ReturnType<typeof useCancelRun>` instead
of hand-typing the generic), an unescaped `'` (`react/no-unescaped-entities`,
`PrDetailHeader.tsx:106`), a stale `eslint-disable` (see Recurring Errors
above), a genuine `useMemo` missing-dependency (`page.tsx:72-75` — fixed by
inlining `reviews ?? []` instead of depending on the derived `runs` local),
and one `_`-prefixed unused param (`reviews.ts:146`) that only needed the
same `argsIgnorePattern: '^_'` override server's config already used
(mirrored into `eslint.config.mjs`). `next-env.d.ts` (regenerated by
`next dev`/`next build`) is excluded from lint — don't hand-fix its
triple-slash-reference error, it'll just come back.

### 2026-09-20 — supersedes the "labelled Dismiss not Reject" note above
The 2026-09-20 "homework rubric requires more findings/severity UI" entry
above flagged the finding-card button as labelled "Dismiss" instead of
"Reject" (rubric criterion 22). Fixed: `messages/en/prReview.json`'s
`finding.dismiss` VALUE is now `"Reject"` (key name unchanged — the
underlying action/API is still `"dismiss"` end-to-end: `onAction("dismiss")`
in `FindingCard.tsx`, server route `POST /findings/:id/dismiss`,
`setFindingDismissed` in the repo layer). Deliberate: only the user-facing
label changed, not the action's internal name/contract — renaming those too
would be a much bigger, riskier API/DB-semantics change than the rubric
asked for. `finding.dismissed` (the past-tense status text shown elsewhere)
was left as "dismissed", not renamed to "rejected" — out of scope, not
asked for, and would need its own pass through every place that status
renders. The severity-pills/filter-buttons/PR-list-popover gaps that entry
also flagged (criteria 16-21) are still unfixed as of this entry.

### 2026-09-20 — supersedes the above: criteria 16-21 (findings-severity UI) now built
All three gaps the "homework rubric requires more findings/severity UI"
entry flagged are now implemented, entirely client-side (server got one new
field, `PrMeta.findings_by_severity` — see `server/INSIGHTS.md`):
- New shared `lib/findings.ts` (`countBySeverity`, `SEVERITY_PILL_ORDER`)
  and `components/severity-pills/SeverityPills.tsx` (wraps the pre-existing
  `SeverityBadge` from `@devdigest/ui` — that component already existed and
  needed zero changes, it just wasn't used anywhere for an aggregate count
  before this).
- PR list FINDINGS column (`constants.ts` GRID/COLUMN_KEYS, `PRRow.tsx`) —
  new `PRRow/FindingsCell.tsx` renders the pill row and, on hover, a
  read-only "N FINDINGS IN THIS RUN" popover (see the Codebase Patterns
  entry above on the lazy-fetch approach).
- Timeline pills (`RunHistory.tsx`, criterion 16's "Timeline tiles also show
  icons, no click" aside) — `FindingsTab.tsx` cross-references the already-
  loaded `runs: ReviewRecord[]` against `prRuns: RunSummary[]` by `run_id`
  to build a `severityCountsByRunId` map client-side, no new fetch. Falls
  back to the old plain-text "N finding(s)" when a run has no matching
  entry (seed data with `reviews.run_id: null` hits this path — real reviews
  created via `POST /pulls/:id/review` always get a run_id).
- Review Runs accordion pills + filters (criteria 16-18) —
  `ReviewRunAccordion.tsx` computes counts from `review.findings` directly
  (already loaded, no cross-reference needed), renders one filter `Button`
  per severity present, toggling a `severityFilter` state threaded into
  `FindingsPanel`'s `visibleFindings()` (`FindingsPanel/helpers.ts`).
  Deliberately computed pill counts from the RAW findings (not post-`hideLow`-
  toggle) — see that file's inline comment for why this still satisfies
  criterion 17 in the default (untoggled) view without lifting `hideLow`
  state out of `FindingsPanel`.
Full coverage added: `components/severity-pills/SeverityPills.test.tsx`,
`lib/findings.test.ts`, `ReviewRunAccordion.test.tsx`,
`PRRow/FindingsCell.test.tsx`, plus new cases in `RunHistory.test.tsx` and
`FindingsPanel.test.tsx`.

### 2026-09-20 — supersedes the above: Timeline pills got the wrong interaction TWICE before landing on the right one
The mockup screenshot (the one this whole feature was built from) shows the
Timeline's severity badge triggering a rich hover **preview popover**
(severity/title/category/file:line/confidence/description — identical to
the PR list's), not a navigation action. Two wrong guesses before checking
the mockup again: (1) initial build left the badge fully inert (no
interaction at all — a real gap, correctly flagged by the user as "not
clickable"); (2) first fix made it a click-target that jumps to the Review
Runs card below, reusing the *agent name's* existing behavior — reasonable
guess, wrong per the actual mockup, and confirmed wrong via an annotated
screenshot pair (`issue.png` showing the "Jump to..." tooltip that resulted,
`proper.png` re-showing the original mockup's rich popover). Fixed by
extracting the popover UI (previously only in `PRRow/FindingsCell.tsx`) into
a shared `components/findings-popover/FindingsPopover.tsx`, used by both
`FindingsCell` (lazy-fetches on hover) and a new `TimelineFindingsPills`
inline component in `RunHistory.tsx` (findings already in memory via
`FindingsTab`'s `findingsByRunId` map — no fetch). `RunHistory`'s prop
renamed `severityCountsByRunId` → `findingsByRunId: Map<string,
FindingRecord[]>` (richer — counts are now derived locally via
`countBySeverity` from the full findings, not passed pre-aggregated) so the
Timeline can render the same rich cards, not just counts. Lesson: when a
mockup exists, re-check it before guessing at "what should clicking this do"
— an existing nearby interaction pattern (the agent-name click-to-jump) is
not evidence the new element should behave the same way.

## Open Questions
