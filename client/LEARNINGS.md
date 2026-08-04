# client — engineering learnings

**While working:** append only. Read the file before writing — if the lesson
is already here, extend that entry instead of adding a second copy. If one
turns out wrong, add a new entry correcting it rather than editing history.

**During a scheduled review** (quarterly, or when this file stops being
useful): merge duplicates, delete entries about code that no longer exists,
and resolve contradictions explicitly — two entries giving opposite advice
make the agent pick at random. Treat this file as a draft under review, not
as truth; a bad entry is worse than a missing one.

## What Works

### 2026-07-28 — money formatting here needs significant digits, not fixed decimals

Real run costs in this app are ~$0.0004–$0.02 (verified against `agent_runs`
on the dev DB). Any fixed-decimal formatter renders nearly all of them as
"$0.00" — which is exactly what the pre-`d45ab0d` helper did
(`usd.toFixed(2)`). A magnitude ladder isn't enough either: capping at 4
decimals turns $0.00039347 into "$0.0004", one significant digit.

`formatCost` in `src/lib/format.ts` uses `toPrecision(3)` for sub-dollar
values, trims trailing zeros (so 0.012 → "$0.012", not "$0.0120"), and pads
back to 2 decimals when trimming leaves fewer (0.1 → "$0.10"). Values ≥ $1
use plain `toFixed(2)`. Keep `null` → "—" strictly distinct from `0` →
"$0.00": null means no completed run / unknown pricing, and showing a price
there is the bug the whole format exists to prevent.

## What Doesn't Work

## Codebase Patterns

### 2026-08-02 — don't copy `pulls/page.tsx` as a route template; it's the deviation, not the pattern

`client/CLAUDE.md` says pages stay thin, and `agents/page.tsx`,
`settings/[section]/page.tsx` and `onboarding/page.tsx` do exactly that — 7–9
lines returning a colocated `*View`. But `repos/[repoId]/pulls/page.tsx` (135
lines) and `pulls/[number]/page.tsx` do the opposite: `"use client"` on the
route file itself, plus fetching, `useSearchParams` parsing and domain rules
(`OPEN_STATUSES`) inline. They're the two biggest files under `app/`, so
they're the ones you land on first when looking for "how a route is built here"
— and copying them propagates a client boundary that covers the whole route.

Use an `AgentsListView`-shaped route as the template instead: `page.tsx`
returns `<XxxView />` and nothing else; `"use client"` goes on the view.

Two more deviations in the same area, worth knowing before you extend them:
`RunTraceDrawer` nests a second `_components/` level (`.../RunTraceDrawer/
_components/TraceSection/TraceSection.tsx`, 11 path segments) — a second level
means it has outgrown "component" and wants `src/features/`. And
`src/lib/hooks/index.ts` is an `export *` aggregation barrel, so importing one
hook from `@/lib/hooks` pulls in all five modules; import from
`@/lib/hooks/core` or `@/lib/hooks/reviews` directly.

Placement rules are codified in
[`.claude/skills/frontend-ui-architecture/`](../.claude/skills/frontend-ui-architecture/SKILL.md);
its README lists these deviations so they stay visible.

### 2026-07-29 — filter chips must count the list they filter, not the raw prop

`FindingsPanel` composes two independent filters: `hideLow` (confidence) and
severity. Counting from the `findings` prop would show "1 SUGGESTION" while
that card is hidden by hide-low-confidence — the number and the list
disagree, and the chip becomes a lie.

The order that keeps them honest, in `FindingsPanel.tsx`:
`visibleFindings(findings, hideLow)` → `countBySeverity(visible)` →
`bySeverity(visible, severity)`. Counts sit *between* the two filters, so
every chip's number equals exactly what clicking it yields.
`countBySeverity` also drops zero-count severities — a chip that filters to
an empty list is a dead end.

Reset `focusIdx` to 0 whenever either filter changes. j/k navigation
otherwise points past the end of the narrowed list and the focus ring
silently vanishes.

### 2026-07-28 — run usage reaches the verdict banner via `prRuns`, not `ReviewRecord`

`ReviewRecord` (`vendor/shared/contracts/review-api.ts`) carries `run_id` but
no tokens/cost — that data lives on `RunSummary`, fetched separately by
`usePrRuns(prId)` on the PR detail page. `FindingsTab` already receives
`prRuns` for the Timeline but historically passed only `review` down to
`ReviewRunAccordion`.

To put run stats on `VerdictBanner`, build a `Map` keyed by `run_id` from the
`prRuns` the page already has and thread the matched fields down
(`FindingsTab` → `ReviewRunAccordion` → `VerdictBanner`) — no new server join
onto `reviewsForPull` needed. Gate rendering on `status === "done"`, matching
the `settled` check `RunHistory.tsx` already applies before showing
score/findings on a run row.

### 2026-07-28 — `vendor/shared` copy has already drifted from server's

`src/vendor/shared` here is an independent copy of `server/src/vendor/shared`,
not auto-synced — it's already missing fields/types the server copy has
(`sessionId`, the `openrouter` provider id, `CommitFile`/`CommitFilesPayload`).
Editing a shared contract only here does not reach the server; the server
keeps stale types and still type-checks clean.

### 2026-08-04 — `TraceBody.tsx` does not render `PromptAssembly` generically; each field needs three explicit additions

Implementing specs/05-intent-layer.md's UI (wiring `PromptAssembly.intent`
into the Run Trace drawer), the spec claimed "RunTraceDrawer's existing
PromptBlock/PromptModalBody need no new code — they already render whatever
PromptAssembly contains section-by-section." That's not true of this
component: `TraceBody.tsx`
(`app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx`)
enumerates each optional slot explicitly — `{trace.prompt_assembly.X != null
&& <PromptBlock .../>}`, plus its own `PROMPT_COLORS.X` entry
(`RunTraceDrawer/constants.ts`) and its own `trace.prompt.X` i18n key
(`messages/en/runs.json`). Proof this was already a pre-existing gap, not
something this session introduced: `pr_description` was added to
`PromptAssembly` before this session but was never wired into `TraceBody.tsx`
at all — it silently does not render in the trace drawer today, and no test
catches it (`RunTraceDrawer.test.tsx`'s fixture never asserts it renders). I
added the three pieces for `intent` but deliberately left the pre-existing
`pr_description` gap alone (out of this task's scope). Any future
`PromptAssembly` field needs the same three additions here — don't trust a
spec's "renders generically, no new code" claim about this component without
checking `TraceBody.tsx` directly.

## Tool & Library Notes

### 2026-07-29 — `borderColor` is a shorthand too, and clashes with `borderLeftColor`

`FindingCard/styles.ts` carried a comment warning "never mix `border`
shorthand with `borderLeft`" — right advice, but it missed its own case.
`borderColor` is *itself* shorthand for the four side colours, so having it
alongside `borderLeftColor` makes React warn: *"Updating a style property
during rerender (borderColor) when a conflicting property is set
(borderLeftColor)"*.

It only fires when the value actually changes mid-life — here `focused`
flipping. It sat dormant until the severity filter (which resets focus on
every filter change) made it fire on every test click.

Fix: set `borderTopColor` / `borderRightColor` / `borderBottomColor`
explicitly and leave `borderLeftColor` as the accent. `transition:
border-color` still animates all four.

### 2026-08-03 — `getByText(exactString)` throws "multiple elements" when a wrapper div has exactly one text-bearing child

`<div><span>{name}</span></div>` with no other content in the div: both the
`span` and its parent `div` have an *identical* normalized `textContent`, so
`screen.getByText("the-name")` (default `exact: true`) matches both and
throws, even though visually there's only one piece of text on the page. Hit
this in `ImportSkillDrawer.test.tsx` waiting on a preview name rendered inside
a header div that wrapped nothing else.

Don't reach for `{ exact: false }` as the fix — that spreads the ambiguity
instead of resolving it (now *more* ancestors match as a substring). Prefer
asserting on something structurally unique instead: a button's enabled state,
a `role` query, or (for prose/paragraph-shaped content where nesting is
unpredictable) `render(...).container.textContent.toContain(...)` — note that
route bypasses RTL's whitespace normalizer entirely, so a `<pre>` block's
literal `\n` must appear in the expected string, not the space RTL's default
normalizer would collapse it to.

### 2026-08-03 — counting `../` to `messages/<locale>/*.json` from a test file: measure, don't guess

Every `*.test.tsx` under `app/` imports its namespace's JSON directly
(`import messages from "../../../.../messages/en/foo.json"`), and the segment
count is easy to miscount by one once a component sits 6+ folders deep
(`skills/_components/SkillsView/_components/SkillEditor/_components/
MarkdownEditor/`). Getting it wrong fails with a Vite "Failed to resolve
import" pointing at the right file with the wrong path — not a hint about
which direction to adjust. Compute it instead of counting by eye:

```sh
node -e "console.log(require('path').relative(
  require('path').resolve('src/app/.../TargetDir'),
  require('path').resolve('messages/en/foo.json'),
))"
```

### 2026-08-03 — importing a RUNTIME value (not just a type) from `@devdigest/shared`'s barrel can make Next's webpack dev/prod build fail with a misleading "Module not found" pointing at the barrel's OWN internal `export *` lines

Two new files under `app/skills/**` — `ConfigTab.tsx` and `ImportSkillDrawer.tsx`
— both did `import { SKILL_NAME_RE, type SkillType } from "@devdigest/shared"`,
mixing a real runtime value (a `RegExp`) with a type in one specifier. `next
build` (and `next dev`) failed with `Module not found: Can't resolve
'./contracts/findings.js'` etc., blamed on `src/vendor/shared/index.ts`'s own
`export *` lines — nothing about the failing line even mentions
`SKILL_NAME_RE`. `pnpm typecheck` (tsc via vitest/tsc, not webpack) saw nothing
wrong, so this only surfaces by actually booting `next dev` or running `next
build` — **typecheck and the vitest suite are not enough evidence that a new
route boots.**

The tell: every OTHER file that imports from this barrel under `app/skills/**`
uses `import type { ... }` only (erased entirely before bundling, never
exercises the barrel's runtime resolution). The two broken files were the only
ones pulling a real value through the 10-contract `export *` barrel — and
worse, fixing the FIRST one just moved the identical error to the next file
still doing that, confirming it's about "resolving the barrel for a runtime
value from this route," not about either file individually.

Fix: import the runtime value from its OWN contract module via the narrower
alias, not the aggregating barrel — `import { SKILL_NAME_RE } from
"@devdigest/shared/contracts/knowledge"` (the `"@devdigest/shared/*"` tsconfig
path exists for exactly this). Bypassed the bug and is arguably more precise
anyway. If a THIRD file needs to import a runtime value (not just a type) from
this barrel, prefer the same narrow-module import over the barrel by default —
don't wait to rediscover this by a broken build.

**Process note:** after adding a new route with several new files, actually
boot it (`pnpm dev` + `curl`, or `next build`) before calling the feature
done — a passing `pnpm typecheck` + `pnpm test` was not sufficient evidence
here.

**Recurred 2026-08-03** in the conventions feature:
`ConventionsView/_components/CreateSkillModal/CreateSkillModal.tsx` did
`import { SKILL_NAME_RE, type ConventionCandidate } from "@devdigest/shared"`
— identical shape, identical failure (`Can't resolve './contracts/findings.js'`
in the barrel). Same fix (split the runtime value out to
`@devdigest/shared/contracts/knowledge`), plus `rm -rf .next` was needed once
to clear the dev server's cached failing module graph even after the source
fix landed. This is now a confirmed recurring trap for any new
`@devdigest/shared` consumer, not a one-off — when reviewing a diff that adds
an import from the bare `@devdigest/shared` barrel, check whether anything in
the specifier list is a value (not `type`-only) before it ships.

### 2026-08-03 — a new route needs FOUR wirings to be reachable, and the sidebar link is the one nothing errors on if you skip it

Shipping `/skills` end to end (page, hooks, i18n) still left it invisible: the
sidebar had no link to it. Three of the four things a new top-level route
needs were already in place and made it *feel* done —

1. the route itself (`app/skills/page.tsx`) — exists, 200s, fully functional
2. active-key detection (`components/app-shell/helpers.ts`) — already had
   `if (pathname.startsWith("/skills")) return "skills";`
3. the i18n label (`messages/en/shell.json` → `nav.skills: "Skills"`)

— but the FOURTH, the actual nav item, lives in a completely different file
that none of those three touch: `src/vendor/ui/nav.ts`'s `NAV: NavGroup[]`
array, a static hardcoded list `Sidebar.tsx` maps over. Skip it and nothing
throws, no test fails, `pnpm typecheck` is clean — the page is just
unreachable from the UI, silently. (2 and 3 without 4 is actually WORSE than
having none of them: the active-key logic and the label sit there ready,
creating the impression the nav is wired when it isn't.)

When adding a new top-level section, grep `src/vendor/ui/nav.ts` for the
route's key FIRST — if it's not in the `NAV` array, the route does not exist
as far as a user clicking through the sidebar is concerned, no matter how
complete everything else is. Also update `SHORTCUTS` in the same file with a
`g <letter>` entry if the section is meant to be keyboard-reachable — that
list is independent of `NAV` and drifts the same way.

### 2026-08-03 — a repo-scoped feature route (`/repos/:repoId/...`) has its own established pattern; don't reach for the workspace-scoped one

Built `/repos/:repoId/conventions` (specs/03) right after `/skills` existed as
the nearest example, but `/skills` is workspace-global — the actual template
for anything scoped to the *active repo* is `repos/[repoId]/pulls`:
`useParams<{ repoId: string }>()` for the id, `useActiveRepo()` for the repo
object (`activeRepo?.full_name`, never trust the raw route param as a display
name), and `useRepoNotFound(repoId)` gating an early `<RepoNotFound />` return
before anything else renders. `nav.ts` entries route through the same
`:repoId` token (`resolveHref`) that `useActiveRepo`'s pathname-first
resolution already expects — no new wiring needed there beyond adding the
`NavItemDef`.

### 2026-08-04 — a mutation hook writing its own result via `setQueryData` in `onSuccess` can still be overwritten by a GET that was already in flight

`useSetConventionStatus` (`src/lib/hooks/conventions.ts`) calls
`qc.setQueryData(conventionsKeys.list(repoId), ...)` in `onSuccess` to avoid a
refetch round-trip. That's not actually safe on its own: `useConventions` has
no `staleTime`, so if a `GET /conventions` was already in flight when the
mutation started (e.g. a background refetch, or the query mounting right as
the user clicks accept/reject), that GET can resolve *after* the mutation's
`onSuccess` and silently overwrite the just-written status with the
pre-mutation snapshot — the card flips back to "pending" until the next
refetch, with no error anywhere. Caught by an automated PR review, not by any
test (this codebase has no hook-level tests — see `client/CLAUDE.md`'s
component-test convention — so a race between two query-client operations
isn't exercised).

Fix: `qc.cancelQueries({ queryKey: conventionsKeys.list(repoId) })` in
`onMutate`, before the mutation fires — cancelling the in-flight GET makes
React Query discard its result instead of letting it land and win the race.
Any future mutation hook here that writes its own `setQueryData` result
(instead of just `invalidateQueries`) needs the same `onMutate` cancel, not
just a `staleTime` bump — `staleTime` prevents a *new* refetch from firing,
it doesn't stop one that's already in flight from resolving late.

### 2026-08-04 — a component under test that calls `useToast()` does not need `<ToastProvider>` in the tree — `vi.spyOn` it like any other hook

`useToast()` (`src/lib/toast.tsx`) throws `"useToast must be used within
<ToastProvider>"` if the context is missing, which makes it look like any
component calling it needs the real provider mounted for tests (pulling in
its portal/state machinery just to assert a mutation's success/error path).
It doesn't — `VersionsTab.test.tsx` (new `Restore` button, first place this
came up) does `vi.spyOn(toastLib, "useToast").mockReturnValue({ success:
vi.fn(), error: vi.fn(), info: vi.fn(), toast: vi.fn() })`, same shape as the
existing `vi.spyOn(hooks, "useSkillVersions")` query-hook mocking pattern
already used across this test suite (see `StatsTab.test.tsx`). Reach for this
before wrapping a test tree in `<ToastProvider>` for any component that only
needs to prove a toast method was *called*, not that a toast actually renders.

### 2026-08-03 — a component that unconditionally calls two mutation hooks (one per "mode") breaks an existing test that only mocked one

Added a URL-import tab to `ImportSkillDrawer` alongside the existing file tab.
Both `useImportSkillPreview()` and the new `useImportSkillFromUrlPreview()`
are called unconditionally at the top of the component (correct per rules of
hooks — you can't call a hook only in one branch), but the FILE-mode test
suite only mocked the first one via `vi.spyOn`. The second hook hit the real
`useMutation` and failed with "No QueryClient set" — a failure with no
apparent connection to the file-mode test itself, since that test never
touches the URL tab. Whenever a component grows a second parallel hook call
for an alternate mode, go back and stub it in every EXISTING test for that
component, not just the new test for the new mode — the old tests will fail
for a reason invisible from their own diff.

## Recurring Errors & Fixes

### 2026-07-28 — PR-list columns live in three places that must stay in sync

Adding a column to the PR list means editing `COLUMN_KEYS` *and* `GRID` in
`src/app/repos/[repoId]/pulls/constants.ts` — `GRID` is a
`grid-template-columns` string whose track count must match `COLUMN_KEYS`
length, and it's consumed by both `s.headRow` and `s.row` in `styles.ts`. Add
the cell to `PRRow.tsx` in the same ordinal position, plus a label under
`list.columns` in `messages/en/prReview.json`. Miss the `GRID` track and the
header/row cells silently shear apart by one column with no error.

Testing note: asserting `getByText("—")` on a PR row is ambiguous — the
Updated cell renders "—" too whenever `updated_at` is null (`relativeTime`).
Give the fixture a real `updated_at` so the em dash under test is unique.

## Session Notes

## Open Questions

### 2026-07-28 — `formatTokens` is coarse below 1K

`formatTokens` renders in thousands with one decimal, per the spec'd
"8.2K→1.3K" format. Typical completion sizes here are small (125 tokens →
"0.1K"), so the out-side is often near-meaningless. Left as-is to match the
agreed format; revisit if the token figures are meant to be read precisely
rather than as a magnitude.
