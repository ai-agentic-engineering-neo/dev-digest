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

### 2026-08-12 — copying SkillsTab's "catalog + link-state" row model for a non-repo-authoritative catalog needs a union, not a lookup

Building the agent/skill editors' Context tab (specs/09-project-context-folder.md),
the plan said "copy SkillsTab's proven shape" — and the checkbox/drag/filter
mechanics do carry over directly. But `SkillsTab/helpers.ts`'s `buildRows`
assumes the catalog (`useWorkspaceSkills()`) is authoritative: every row comes
from the catalog, cross-referenced against the link table. That assumption
breaks for documents, because the "catalog" here (`useRepoDocuments(repoId)`)
is a live filesystem scan — a document can be deleted/renamed/moved out of the
search roots *after* it was attached, and AC-26 requires the attachment to
keep rendering as `missing`, not vanish. `ContextTab/helpers.ts`'s `buildRows`
therefore builds rows from the **union** of catalog paths and attachment
paths (`new Set([...catalogByPath.keys(), ...attachedByPath.keys()])`), not a
map over the catalog alone — a since-deleted attachment gets a row with
`docType: null` and `missing: true` instead of silently disappearing. Any
future tab that cross-references a live external catalog (filesystem, remote
API) against a persisted link table needs the same union, not the SkillsTab
lookup shape, whenever the catalog can drift independently of the links.

Separately: `ContextTab` (both the agent and skill editor's) is NOT a
repo-scoped route (`/agents/:id`, `/skills/:id` carry no `:repoId`), but still
needs one repo's document catalog to attach from. It resolves this via
`useActiveRepo().activeRepo?.id` from `src/lib/repo-context.tsx` — the same
shell-wide "current repo" used by the sidebar/command-palette, not a route
param. This is a legitimate use of `useActiveRepo()` OUTSIDE a
`/repos/:repoId/...` route, which every prior consumer of that hook was.

**2026-08-12 correction (caught by an automated API Contract Reviewer finding
on PR #9, 100% confidence) — "legitimate" above was wrong once the entity
already has attachments.** `useActiveRepo()` is shell-wide state (URL path >
`localStorage` > first repo in the list, `repo-context.tsx:47-48`) with zero
relationship to which repo an agent's/skill's *own* attachments are pinned to
(spec D3: an attachment records `(repo, path)` and never re-resolves against a
different repo). Both wrapper components
(`app/agents/[id]/_components/AgentEditor/_components/ContextTab/ContextTab.tsx`,
the skill editor's sibling) used `activeRepo?.id` unconditionally for `repoId`
— so if the user navigated to `/agents/agent-1?tab=context` with a DIFFERENT
repo active in the sidebar than the one `agent-1`'s attachments actually
belong to, `onToggle`/`onReorder` would silently write to the wrong repo.
Worse for `onReorder`: `SharedContextTab.applyOrder` sends ONE `repoId` for
the WHOLE reordered set (`repo_id: repoId` mapped over every path,
`ContextTab/ContextTab.tsx:124`), so reordering an already-attached agent's
documents while the wrong repo was active would silently REWRITE every
attachment's `repo_id` to that wrong repo — real data corruption, not just a
failed write. Fix: derive `repoId` from `attachments?.[0]?.repo_id` first,
falling back to `activeRepo?.id` only when the entity has no attachments yet
(nothing to anchor to — the very first attach still has to come from
whatever repo is active). Any future consumer of `useActiveRepo()` outside a
`/repos/:repoId/...` route that also reads/writes an already-persisted,
repo-pinned record must anchor to the record's own repo once one exists, not
trust shell state for anything beyond the "nothing attached yet" case.

### 2026-08-04 — `diff-viewer/`'s deliberately narrow public surface had to be widened for a second real consumer; the target+nonce scroll pattern now exists in two places

Building `SmartDiffViewer` (`app/repos/[repoId]/pulls/[number]/_components/
SmartDiffViewer/`), the existing `src/components/diff-viewer/` module needed
to render files grouped by risk instead of `DiffViewer`'s flat list — but
still reuse the same patch parsing and inline-commenting logic, not fork a
second renderer. `diff-viewer/index.ts` originally exported only `DiffViewer`
+ `DiffCommentApi` on purpose (its own top comment said so); it now also
exports `FileCard`, the per-file collapsible unit, since a grouped view needs
to render one `FileCard` per file directly rather than going through
`DiffViewer`'s flat `files.map`. `FileCard`/`CodeLine` gained three additive,
backward-compatible optional props: `defaultOpen` (override the size-based
auto-expand — used to force boilerplate files closed), `scrollTarget: {
line, nonce } | null` + a matching `id={diffline-{path}-{line}}` on
`CodeLine`'s row, and `headerExtra: ReactNode` (a findings-count badge
rendered in the file header, with the caller responsible for
`stopPropagation` so clicking it doesn't also toggle the card). The
`scrollTarget`/`nonce` shape is a direct copy of `ReviewRunAccordion.tsx`'s
`targetRunId`/`targetNonce` pattern — it now exists in two independent
places. If a third "click X, open + scroll to Y" need shows up, it's worth
extracting into a shared hook instead of copying a third time.

**2026-08-06 — the third case showed up (mentor feedback on PR #6: Smart Diff's
findings badge should switch to the Findings tab and highlight the finding's
card, not just scroll within the diff) and it was NOT extracted into a shared
hook — copied a third time, deliberately.** The three "target+nonce" instances
turned out to need different payloads at each level (`FileCard`'s is `{ path,
line }`+nonce; `ReviewRunAccordion`'s is `{ runId }`+nonce; the new
`FindingCard`'s is `{ findingId }`+nonce, i.e. just its own `f.id === target`
check) and different owners: `SmartDiffViewer`'s click doesn't know which
review run a finding belongs to, so `PrDetailView` (the only component holding
both `allFindings` and the tab state) owns a NEW `findingTarget` state and a
`handleSelectFinding` that both switches `tab` to `"findings"` AND bumps the
nonce; `FindingsTab` then *reuses* its own existing `target`/`setTarget` state
(the one Timeline-click navigation already drives) to open+scroll the right
`ReviewRunAccordion`, by resolving `targetFindingId` → containing `run_id` via
`runs.find(r => r.findings.some(f => f.id === targetFindingId))` — so the
accordion-level open/scroll got FOLDED into the existing mechanism instead of
adding a fourth copy, while `targetFindingId`/`targetFindingNonce` themselves
still thread straight through as new props (`ReviewRunAccordion` →
`FindingsPanel` → `FindingCard`) for the card-level expand+highlight+scroll
+ keyboard-focus-move, since that's a genuinely different concern (which
card, not which run). A generic "useTargetScroll(id, nonce)" hook would have
had to abstract over these three different identity shapes and two different
state owners — copying stayed cheaper. Revisit extraction only if a FOURTH
case needs the exact `{ id }`+nonce shape one of these three already has.

**2026-08-14 — the fourth case arrived (specs/11-why-risk-brief.md AC-39, Q7:
PR Brief review-focus click → Files tab, open+scroll that file/line) and it
was STILL not extracted — it reused `FileCard`'s existing `{ path, line }`+
nonce shape exactly, the "supplying an existing prop from a new owner" case
Q7 called out in advance, not a new copy.** `PrDetailView` gained a
`focusTarget: { file, line: number | null, n } | null` state + a
`handleFocusFile` that mirrors `handleSelectFinding` line-for-line — same
component, same reasoning (it already owns both the tab state and every other
cross-tab target). The one genuinely NEW widening: `FileCard`'s `scrollTarget.
line` became `number | null` (previously always `number`) — `line: null` now
scrolls to a new `id={difffile-{path}}` on the card's own root (exported as
`fileAnchorId`) instead of a `diffline-{path}-{line}` row, additive and
backward-compatible (no existing caller ever passed `line: null`, both
existing consumers — `DiffViewer`, `SmartDiffViewer` — still resolve a normal
numeric line unchanged). This is the real fifth-case decision point: the next
"click X, open+scroll Y" need that ALSO wants a file-only (no-line) target can
reuse `fileAnchorId`/the widened `scrollTarget` shape directly; a need for a
genuinely different identity (not `{path, line}`) still doesn't justify
extracting a shared hook by this file's own three-copies-first precedent.

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

### 2026-08-13 — `src/vendor/ui/primitives/Markdown.tsx` sets no `urlTransform` and no `img` override — it does not constrain link/image targets

Confirmed while building the Onboarding Tour page
(specs/10-onboarding-generator.md AC-32/AC-41): `Markdown.tsx` is
`react-markdown` + `remark-gfm` with no `rehype-raw` — that already blocks raw
HTML from rendering as markup (a `<script>` tag in a body renders as inert
text, AC-41), but it does NOT touch link (`a`) or image (`img`) targets.
`react-markdown`'s own default `urlTransform` only blocks `javascript:`, not
an arbitrary `https://` external — so a model-authored `[x](https://evil
.example)` or `![](https://tracker/beacon.png)` inside a markdown `body`
would render as a live link / a loading remote image if nothing upstream
stripped it first. This component is shared by every feature that renders
markdown, so it was deliberately left untouched rather than hardening it here
— the Onboarding module's `grounding.ts` (`neutralizeBody`) scans and
strips disallowed link/image targets from `body` text server-side instead,
before the client ever sees them. Any FUTURE feature that renders
model-authored or otherwise untrusted markdown through this primitive must do
the same (validate/strip targets before they reach `Markdown.tsx`, not after)
— this primitive will not save you.

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

### 2026-08-13 — `activeKeyFor`'s `pathname.includes(...)` checks are a substring-match bug class, not just the one `/onboarding` case

`components/app-shell/helpers.ts`'s `activeKeyFor` matched the Onboarding Tour
nav key via `pathname.includes("/onboarding")` — but `/onboarding` is also the
real route for the unrelated add-a-repo screen (`src/app/onboarding/page.tsx`),
so visiting that screen wrongly highlighted "Onboarding Tour" in the sidebar
(specs/10-onboarding-generator.md D10/AC-39; the tour route itself is
`/repos/:repoId/tour`, chosen specifically to share no segment with
`/onboarding`). Fixed with a local `hasSegment(pathname, seg)` helper
(`pathname.split("/").includes(seg)`) instead of `.includes()` on the raw
string. The other rows in `activeKeyFor` (`/context`, `/conventions`,
`/pulls`, `/multi-agent`) still use `.includes()` and carry the same latent
risk — e.g. a future `/pulls-archive` or `/context-help` route would
misfire the same way. Don't add a new route whose slug is a substring of an
existing one without checking `activeKeyFor` first; prefer `hasSegment` for
any NEW entry, and consider migrating the existing `.includes()` rows the
next time one of them causes a real collision.

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

### 2026-08-06 — a written spec's UI section can describe the wrong placement; a design mockup screenshot overrides prose

`specs/07-blast-radius.md` said "a Blast Radius **tab** on the PR detail
page" and the first implementation pass built exactly that — a fourth
`PrDetailHeader` tab, `BlastRadiusTab`. The actual product design (per a
mockup screenshot the user supplied afterward) places it as a **card** on the
Overview tab, side by side with `IntentCard` in a two-column grid — no new
top-level tab at all. Corrected by deleting `BlastRadiusTab/` and adding
`BlastRadiusCard/` (mirrors `IntentCard`'s folder shape: `SectionLabel`
header, no outer `Card` wrapper at the section level), wired into
`OverviewTab`'s new `s.overviewGrid` (`gridTemplateColumns: "1fr 1fr"`)
instead of `PrDetailHeader`'s `tabs` array. The prose spec had no cross-check
against a design mockup — when one exists (or the user later supplies one),
it is the source of truth for placement/layout, not the spec's word choice.
`specs/07-blast-radius.md` itself was amended after the fact to describe the
card, so it stays accurate for the next reader.

### 2026-08-06 — `PrDetailView`'s own `maxWidth: 1080` (not the sitewide `PageShell` 1200) was capping every PR-detail tab narrower than the figma

Reported as "cards look narrower than figma" across all three PR-detail tabs
(Overview, Agent runs, Files changed) — not just the new `BlastRadiusCard`.
`PrDetailView/styles.ts`'s `s.body`/`s.loadingStack` had their own
`maxWidth: 1080; margin: 0 auto`, independent of (and narrower than)
`page-shell/styles.ts`'s sitewide `maxWidth: 1200` used by list-style pages
(Pull Requests list, Agents list, etc.). No child component in the PR-detail
tree (`OverviewTab`, `FindingsTab`, `DiffTab` and everything under them —
confirmed by a repo-wide grep for `maxWidth` scoped to
`_components/[repoId]/pulls/[number]`) added its own width cap — this was
the only constraint. Fixed by dropping the `maxWidth`/`margin: auto` from
both, keeping only the padding — this page's figma is a full-bleed,
data-dense layout, unlike the sitewide list-page standard. If a future page
in this tree wants a narrower reading width for a text-heavy section (e.g.
a single-column article-style body), scope the constraint to that specific
child, not `PrDetailView`'s shared body wrapper — that wrapper is now
intentionally unconstrained for every tab this page contains.

### 2026-08-06 — a second hook can read a slice of an already-fetched query with zero extra requests, via a matching `queryKey` + `select`

Extracting `IntentCard` out of `OverviewTab` (mentor feedback on PR #6) needed
its own data-fetching hook rather than taking the five `intent_*` fields as
props — but `usePullDetail(prId)` (`lib/hooks/core.ts`) already fetches the
whole `PrDetail` including those fields, and `PrDetailView` mounts `IntentCard`
only after that fetch has already resolved. `lib/hooks/intent.ts`'s
`useIntent(prId)` reuses `usePullDetail`'s exact `queryKey: ["pull", prId]`
and `queryFn`, adding only a `select: toIntent` to narrow the return shape —
React Query treats identical `queryKey`+`queryFn` calls as the SAME cache
entry (dedup is by key, not by call site), so this issues zero additional
network requests and still gets its own render-optimized (via `select`) view
of the data. Any future "give this leaf component its own hook instead of
prop-drilling a slice of an already-fetched parent query" need can use this
shape instead of either prop-drilling or a second real fetch.

Testing it followed this repo's already-established convention (see
`StatsTab.test.tsx`/`VersionsTab.test.tsx`), confirmed still the only pattern
in use as of this date: mock the hook module itself
(`vi.spyOn(hooks, "useIntent").mockReturnValue({ data, ... })`) inside a bare
`QueryClientProvider` wrapper, never a real `fetch` stub — this codebase has
no `global.fetch`/`msw` mocking anywhere in `client/src`, confirmed by a
repo-wide grep while building `IntentCard.test.tsx`.

## Session Notes

### 2026-08-12 — test-writer backfill for specs/09: the shared `ContextTab`'s keyboard reorder path and `ProjectContextView`'s empty state had zero coverage

Checking plans/09-project-context-folder.md's client test matrix ("reorder
(drag+keyboard)" / "the view-only page's empty state") against
`src/components/context-tab/ContextTab/ContextTab.test.tsx` and
`.../ProjectContextView/ProjectContextView.test.tsx` found both genuinely
untested despite the implementer session landing the code: (1) `DocumentRow`'s
drag handle has an `onKeyDown` that calls `drag.onMove(±1)` on ArrowUp/
ArrowDown — the existing test suite only exercised mouse drag
(`fireEvent.dragStart`/`drop`), never `fireEvent.keyDown(handle, { key:
"ArrowDown" })`, and never asserted the `reorderAnnounce` live-region text
(`"Moved {path} to position {position} of {total}"`), which is a DIFFERENT
i18n key from the already-tested `attachAnnounce`/`detachAnnounce`, so
testing one gave no signal about the other. (2) `ProjectContextView` branches
on `documents.length === 0` to render `EmptyState` with `t("page.empty.body",
{ roots })`, but every existing test fixture supplied a non-empty
`DocumentList` — the empty-state/roots-named branch (AC-20) had never been
rendered under test at all. Both backfilled. General lesson matching the
server-side entry of the same date: a `plan-verifier` PASS proves the
component exists and behaves per the plan's *description*, not that every row
of the plan's own Verification test matrix has a corresponding test — worth
re-deriving the matrix's exact wording (not just skimming existing test
titles) before calling a component's coverage complete.

## Open Questions

### 2026-07-28 — `formatTokens` is coarse below 1K

`formatTokens` renders in thousands with one decimal, per the spec'd
"8.2K→1.3K" format. Typical completion sizes here are small (125 tokens →
"0.1K"), so the out-side is often near-meaningless. Left as-is to match the
agreed format; revisit if the token figures are meant to be read precisely
rather than as a magnitude.
