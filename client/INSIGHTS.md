# client/ — Insights

Running log of gotchas, tricky bugs, and rationale for non-default decisions in
this module. Linked from [CLAUDE.md](./CLAUDE.md) — not inlined there because
this list is expected to grow and change often (volatile by design).

Format: newest first within each section. One entry = one decision or one
gotcha. Keep entries short; link to code/PR/commit for the full story instead
of re-explaining it here.

---

## What Works

## What Doesn't Work

## Codebase Patterns

### 2026-09-20 — Agent tile stats: accept % is legitimately grey until findings have been accepted/dismissed
`AgentCard` colours the accept segment (`<30` crit, `<60` warn, else ok — `AgentCard/helpers.ts`), but `accept_rate` is `null` until an agent's findings have `accepted_at`/`dismissed_at` set, and then it renders a muted "— accept". A fresh dev/seed DB has 52 findings and zero decisions, so every tile looks monochrome next to a mockup that was screenshotted with real triage data — check `select count(*) from findings where accepted_at is not null` before assuming a styling bug. The model-chip tint is `color-mix(in srgb, <color> 12%, transparent)`: the old `color + "1a"` produced invalid CSS for `var(--…)` colours (every model outside `MODEL_COLOR`).

### 2026-09-20 — Agent Skills tab: only linked skills are sortable; the order sent to the server IS the prompt order
`SkillsTab` renders *Enabled* (sortable, grip) then *Available* (static); `toSkillIds` sends only linked ids in list order and `resolveActiveSkills` builds the prompt in that order, so reordering is user-visible in the run trace. A skill that gets flagged for injection after being linked keeps a working toggle (so it can be unlinked) because the server exempts already-linked skills from the 422; a 422 `SKILL_BLOCKED` is already toasted by the global handler, so the tab only unlinks + refetches (a second toast doubled up).

### 2026-09-20 — Trace skills-token badge is approximate by design
`RunTraceDrawer` shows `~{n} tokens` next to "Skills (dynamic)": the server stores `prompt_assembly_meta.skills_tokens` (real tokenizer, js-tiktoken cl100k, over the joined skill bodies only — not the `## Skills / rules` header), and old traces fall back to client-side `ceil(length/4)`, so the two can differ slightly — hence the `~`.

### 2026-09-19 — Skill version diff is a hand-rolled line LCS with a size cap, not a diff library
`SkillVersionsTab/diff.ts` diffs each version's body against the previous one (only bodies can differ — the server snapshots `skill_versions` on body change only). It trims the shared prefix/suffix, then runs an LCS table; if the remaining region exceeds 4M cells `diffLines` returns `null` and the UI shows a "too large to diff" note pointing at the Rendered view (imports can be up to 256 KB, so an uncapped table would allocate ~100 MB). Kept dependency-free on purpose; swap in a real diff lib only if word-level or moved-block diffs are ever needed.

### 2026-09-19 — `messages/en/*.json` files are each auto-loaded as their own i18n namespace; new features can add a file instead of editing a shared one
The loader merges every JSON in `client/messages/en/` under its filename (`skills.json` → `useTranslations("skills")`), so the import drawer's strings live in a new `skillsImport.json` rather than growing `skills.json`. Useful when two people/agents touch one feature's copy concurrently — no merge conflict on a shared file, no loader change needed.

### 2026-09-19 — Agent Skills tab: checkbox = `agent_skills` membership, list order = prompt order, Save is explicit
`AgentEditor/_components/SkillsTab` lists the whole catalog but persists only the linked ids, in list order, via `useSetAgentSkills` (server `setSkills`: `order` = array index). So reordering only *unlinked* rows changes nothing persistent and doesn't enable Save; a globally disabled skill (`skills.enabled: false`) can still be linked but is skipped at run time, hence the dimmed row. Drag is disabled while the filter is active so `arrayMove` indices stay valid.

### 2026-09-19 — Most `page.tsx` files are `"use client"` by design, not oversight — the API is a separate Fastify server, not Next.js server-side data
5 of 7 `page.tsx` files (`app/page.tsx`, `app/onboarding/page.tsx`,
`app/agents/[id]/page.tsx`, `app/repos/[repoId]/pulls/page.tsx`,
`app/repos/[repoId]/pulls/[number]/page.tsx`) fetch client-side via
`lib/hooks/*` (TanStack Query) instead of using React Server Components /
`redirect()` the way a typical Next.js app would. This looks like a missed
optimization on a quick read, but it's deliberate: all data lives behind
`@devdigest/api` (a separate Fastify server at `NEXT_PUBLIC_API_BASE`), not
in Next.js's own server runtime, so there's no RSC-native data-fetching win
here — a server component would still have to make the same HTTP round trip.
More importantly, these pages depend on TanStack Query's client-side cache
and invalidation (SSE-driven review runs, live status updates, optimistic
finding accept/dismiss) — owning the fetch on the client is what makes that
live-update UX work without a manual refetch dance. Converting these to
Server Components would need a parallel client-side re-fetch/subscription
layer anyway, for uncertain benefit. Revisit only if the API moves inside
the Next.js server boundary (e.g. route handlers) or if a specific page's
initial-load latency becomes a measured problem — this is a tradeoff, not
an oversight.

### 2026-09-18 — "Agent runs" tab badge showed the FINDINGS total, not the run count — looked like DB corruption but wasn't
`page.tsx`'s "Agent runs" tab badge (`PrDetailHeader.tsx`) was wired to
`allFindings.length` (`runs.flatMap(r => r.findings).length`, summed across
EVERY review ever created for the PR, including old re-runs of the same
agent) — labeled "Agent runs" but showing a findings total, not a run count.
On a PR where 3 agents had each been run twice, this showed "39" (sum of
findings across all 6 historical reviews) where the user expected "6"
(the actual number of runs) — reported as "the database looks odd," but a
full audit found zero orphaned/corrupted rows; it was a mislabeled client-side
calculation, not bad data. Fixed: the tab now shows `prRuns?.length` (the Timeline's
own run count, one row per `agent_runs` entry) via a renamed `runsCount` prop
— `findingsCount`/`allFindings` still exist for the lethal-trifecta banner,
which legitimately needs a findings total, just not for this tab. Lesson:
before touching data when something "looks wrong," check whether the
underlying data is actually inconsistent (query it) — here the DB was
completely consistent; the bug was a badge counting the wrong thing.

### 2026-09-18 — CORRECTION: severity counts + filter should be ONE merged icon+count row, not two rows
`ReviewRunAccordion.tsx` had a separate, non-interactive severity pill row
(icon+label+count) above `FindingsPanel`'s own filter-button row (icon+label,
clickable) — added per a literal reading of rubric criteria #16 ("counts
row") and #18 ("filter buttons") as two distinct UI elements. User corrected
this: only one row should exist, icon+colored+count, no severity word/label
at all. Removed the `ReviewRunAccordion` pill row entirely; `FindingsPanel`'s
filter pills (`FindingsPanel/styles.ts:severityFilterPill`) now double as the
counter, built from a plain `<button>` (not the generic `Button`, which can't
tint its icon per severity) with the label kept only as `aria-label` for
accessibility. Lesson: when a spec/rubric describes what could be one UI
element described two ways or two separate elements, and the reference
mockup (`img_02.jpg` here) actually showed one merged element, don't default
to "two separate elements" from ambiguous prose — check the mockup again.

### 2026-09-18 — `verdict.findingsCount` had the same hardcoded-plural bug as the popover title fix
`"{count} findings"` (used by both `VerdictBanner.tsx` and `RunHistory.tsx`'s
Timeline click-to-modal title) showed "1 findings" for a single finding — the
same class of bug as the earlier "1 FINDINGS IN THIS RUN" fix, just a
different key. Fixed to `"{count} finding(s)"` (`messages/en/prReview.json`),
covering both surfaces from one shared key. Note: `messages/en/compose.json`
and `runs.json` already use proper ICU plural syntax
(`{count, plural, one {# finding} other {# findings}}`) for the same concept
— a pre-existing inconsistency with this file's "(s)" convention, not fixed
here (out of scope), but worth knowing before adding another count string.

### 2026-09-18 — CORRECTION: `formatTokens` should be ONE abbreviated total, not an in→out pair
Misread "show a specific count, not a range" (user feedback on the Timeline's
new token display) as "show exact numbers instead of abbreviating" — actually
the complaint was that an "in→out" PAIR reads as a range at a glance,
regardless of whether it's abbreviated or exact. The entry directly below
this one (exact comma-separated in→out counts) was itself already a wrong
fix. Correct behavior: `formatTokens(tokensIn, tokensOut)` sums the two into
ONE total and abbreviates it ("13.5k", "12k", or a plain integer under 1000)
— a single figure, not a pair. Lesson: when a user says a display "looks
like a range," the fix is usually to collapse it to one number, not to
change its precision.

### 2026-09-18 — `formatTokens` shows exact counts, not an abbreviation — same lesson as the cost formatter
Per user request, the Timeline's run tiles now show token count to the left
of cost (`RunHistory.tsx`); while wiring that up, `formatTokens` was changed
from an abbreviated "12k→1.5k" to exact, comma-separated counts
("12,000→1,500", via `toLocaleString`) — an abbreviation rounds away real
precision the same way a too-low `formatCost` `minDecimals` did (see the
correction entry below), so fixed it at the shared formatter rather than only
in `RunHistory.tsx`, keeping the trace drawer's token stat consistent too.

### 2026-09-18 — CORRECTION: `formatCost`'s decimal floor must be the SAME everywhere, not opt-in per surface
The entry below this one gave the PR list's COST column its own `minDecimals: 4`
while leaving Timeline/trace-drawer callers on the old default of 2. That broke
the very invariant the formatter's own docstring promised ("a run reads
identically on every surface") — a Timeline run costing e.g. $0.0067 displayed
as "$0.01" (2-decimal rounding), while the PR list showed the precise total,
so manually summing the Timeline's rounded numbers no longer matched the PR
list total and looked like a math bug (it wasn't — the aggregation was
correct, only the *display* precision differed). **Fix:** `minDecimals`
now **defaults to 4** (`lib/format.ts`); `PRRow.tsx` dropped its explicit `4`
since it's now redundant, and `RunHistory.tsx`/`TraceBody.tsx`'s bare
`formatCost(cost)` calls picked up the higher precision for free. Lesson:
when a shared formatter's whole point is cross-surface consistency, change
its *default*, not one call site — an opt-in param is exactly how this drifted.

### 2026-09-18 — `formatCost` grew an optional `minDecimals` param instead of a second formatter
The PR list's COST column needed 4 decimals (`$0.0140`) while the Timeline and
trace drawer keep the original 2-decimals-growing-as-needed behavior.
`formatCost(usd, minDecimals = 2)` (`lib/format.ts`) took an optional param
with the old default preserved, rather than adding a parallel formatter —
existing call sites are unaffected. If a surface needs a different decimal
floor, extend this signature rather than forking it. **Superseded by the
entry above — the "old default preserved" part was the bug.**

### 2026-09-18 — Compact (icon+count, no label) is the default for small/dense severity indicators
Per explicit user feedback, `RunHistory.tsx`'s Timeline severity icons switched
from `SeverityBadge ...` (icon+label+count, e.g. "⚠ WARNING 2") to
`SeverityBadge ... compact` (icon+count only). Non-compact stays reserved for
a summary row that has room to spare, e.g. `ReviewRunAccordion`'s pill row
under the verdict banner. Default new small/dense severity indicators to
`compact` unless there's a specific reason to spell out the word.

### 2026-09-18 — Extracted `FindingPreviewRow` to stop a read-only finding-summary render from forking in two
The PR-list FINDINGS popover and the PR-detail Timeline's per-run findings
modal both needed an identical read-only finding summary (severity badge,
title, category, file:line, confidence%, truncated rationale) and had started
as two near-duplicate inline implementations. Unified into
`src/components/FindingPreviewRow.tsx` (cross-route shared, alongside
`app-shell`/`repo-not-found`/`showcase`), taking a plain data shape rather
than the full `FindingRecord` so either caller (fetched via hook, or passed
directly as props) can use it without adapting types.

### 2026-09-18 — PR-list FINDINGS popover reuses `usePrReviews`, no new endpoint needed
`FindingsPopoverContent.tsx` (PR list's FINDINGS column popover) calls the
existing `usePrReviews(prId)` hook — gated with `enabled` on hover state —
rather than adding a new backend route, since that hook already returns every
review's full `findings` array for a PR (it backs the PR-detail Review-runs
accordion too). Check for an existing hook that already fetches the data
you need before adding an endpoint.

### 2026-09-18 — New `Popover` primitive is hover-triggered, deliberately unlike `Dropdown`
`src/vendor/ui/kit/Popover.tsx` opens/closes on hover, with a shared ~120ms
close-timeout between the trigger and the panel (so moving the cursor from one
to the other doesn't dismiss it) — a different interaction model from
`Dropdown` (click-triggered, closes on outside-click). Needed for the PR-list
FINDINGS column popover (read-only, no actions to protect from an accidental
click-away), so don't reach for `Dropdown` when you actually want hover.

### 2026-09-18 — `vi.mock("@/...")` works fine, same as long relative-path mocks
Confirmed in `PRRow.test.tsx`'s hover-popover test: mocking via the `@/`
tsconfig-path alias (`vi.mock("@/lib/hooks/reviews", ...)`) resolves to the
same module Vite/Vitest would resolve from the real import, so it's a fine
alternative to the long relative-path mocks used elsewhere in this repo —
prefer whichever form matches how the file under test already imports it.

### 2026-09-18 — Severity pill counts track the run's full finding set, not the nested filter
`ReviewRunAccordion.tsx`'s "N CRITICAL · N WARNING · N SUGGESTION" pill row is
computed from `countBySeverity(review.findings)` — the run's complete, unfiltered
findings — never from whatever `FindingsPanel`'s local `hideLow`/`severityFilter`
state currently shows. Deliberate: keeps the counter row a stable, always-accurate
total regardless of what's filtered below it, and avoids lifting `FindingsPanel`'s
local filter state up into the parent for no tested benefit. See
`ReviewRunAccordion.tsx:59-66` and the new `lib/findings.ts:countBySeverity`.

### 2026-09-18 — `Dropdown` hosts arbitrary content via an interface field, not a union
`src/vendor/ui/kit/types.ts`'s `DropdownItemDef` is a plain interface, not a
discriminated union, so adding multi-select checkbox support meant adding one
optional field — `custom?: (close: () => void) => React.ReactNode` — rather than
converting the whole type to a union. `Dropdown.tsx` renders it as one more row
type (`it.custom(...)`), letting a menu host non-row content (e.g.
`RunReviewDropdown`'s `AgentSelectList`) without auto-closing on click.

### 2026-09-18 — Timeline per-tile severity icons reuse already-loaded findings, no backend change
`RunSummary` (the Timeline's `runs` prop) only carries aggregate `findings_count`
and a `blockers` (CRITICAL-only) count — no per-severity breakdown. Rather than
extend the server schema, `FindingsTab.tsx` builds a `run_id -> SeverityCounts`
map from its `runs` prop (actually `ReviewRecord[]`, which already has full
`findings` per review) using `countBySeverity`, and passes it to `RunHistory` as
`severityCountsByRunId`. A tile with no matching review entry (e.g. review not
yet loaded) simply renders no icons — a graceful, non-error fallback.

### 2026-09-18 — Timeline severity icons are static by design (no click/popover)
Confirmed with the user: the homework's informal description suggested a
click-to-open modal on Timeline severity icons, but the graded rubric
(`to_analyze/home_work_requirements.txt`, criterion #16) explicitly says Timeline
tiles show icons "без кліку" (no click) — the interactive read-only findings
preview instead lives on the PR **list** page (criteria #20-21). `RunHistory.tsx`'s
severity badges have no `onClick`/`Popover` wrapper as a result.

### 2026-09-17 — Cost/token formatters live in `lib/format.ts`, not colocated per-feature
`formatCost`/`formatTokens` started folder-local to `RunTraceDrawer/helpers.ts`
(its only consumer). Once the PR-list COST column and the Agent-runs timeline
needed the same formatting, both moved to `src/lib/format.ts` so a run reads
identically on every surface; `RunTraceDrawer/helpers.ts` now just re-exports
them. Check `lib/format.ts` before adding a new local copy of either.

### 2026-09-17 — `formatCost`: `null` and `0` are different facts, not a rounding choice
Unknown cost (no completed run yet, or an unpriced model) renders `—`; a
genuinely free run renders `$0.00` — collapsing the two loses real
information. Below $1 the formatter grows past 2 decimals only as far as
needed to clear a `$0.00` rounding, since real per-run costs here are often a
few hundredths of a cent (`toFixed(2)` alone would show almost every run as
free). See `client/src/lib/format.test.ts` for the pinned values.

### 2026-09-16 — Always import UI via the `@devdigest/ui` barrel
Reaching into a layer file directly (e.g. `src/vendor/ui/primitives/Button.tsx`)
works today but breaks the point of vendoring: the barrel (`index.ts`) is the
only surface the showcase smoke test (`src/test/smoke.test.tsx`) and future
re-vendoring passes actually guarantee. Importing around it causes silent drift
that only surfaces when the vendored copy is refreshed.

### 2026-09-16 — Shared contracts must be mirrored by hand
`src/vendor/shared` here is a separate, hand-copied instance of
`@devdigest/shared` from `server/src/vendor/shared` — there's no workspace or
symlink. A schema change made in one and not the other desyncs request/response
contracts with no compiler error until a runtime mismatch shows up.

## Tool & Library Notes

### 2026-09-20 — `@devdigest/ui` gotchas hit while adding modals, badges and toggles
`Modal` is not a portal: render `ConfirmDialog` as a *sibling* of a clickable or `opacity`-dimmed card (not inside it), or clicks bubble to the card and the dialog inherits the dimming. `IconBtn.onClick` gets no event, so wrap it in a `stopPropagation` span. `Toggle`/`Checkbox` have no `disabled` prop — use `SkillEnabledToggle` (inert + dimmed) and wrap in a `<label>` for an accessible name. The toast has no warning kind. `ToastProvider` already owns a `role="status"` region, so don't add that role to badges. Any test rendering `SkillEnabledToggle` or `InjectionBadge` needs the `skills` namespace in its messages or next-intl logs MISSING_MESSAGE.

### 2026-09-20 — Editing CRLF files from scripts silently normalises them
Many client/server files are CRLF in the working tree. The `Edit` tool preserves CRLF, but Python's default newline handling and `\n`-only node string replaces either rewrite the whole file to LF (a noisy diff) or fail to match. When patching from a script, open with `newline=''` and match `\r\n`; and when writing `\uXXXX`/`\n` escapes through the Write tool or a heredoc, check the escape wasn't emitted as a literal character. `vitest` runs from the package root — `pnpm exec vitest run src/app/agents`, not a path relative to `src/`.

### 2026-09-19 — jsdom's `File`/`Blob` has no `.text()` or `.arrayBuffer()`; archive extraction needs a `FileReader` fallback
Browsers and Node have them, jsdom (vitest env) doesn't, so `extractSkillFile` (`app/skills/_components/ImportSkillDrawer/extract.ts`) reads via `FileReader` when `.arrayBuffer` is missing — otherwise every drawer/extract test throws `file.text is not a function` while the feature works fine in a real browser.

### 2026-09-19 — An exported test helper returning `render(...)` fails typecheck with TS2742 — annotate `RenderResult`
`export function renderWithProviders(ui) { return render(...) }` in `app/skills/_test/harness.tsx` errors ("inferred type cannot be named without a reference to `.pnpm/@testing-library+dom…`") because pnpm's nested path isn't portable. Give it an explicit `: RenderResult` (imported from `@testing-library/react`); `vitest` itself doesn't type-check, so only `pnpm typecheck` catches it.

### 2026-09-19 — The `Write` tool can turn a ` `-style escape in source into a literal NUL byte
Seen while writing `extract.ts`: an escape written into a regex/string landed as a real NUL in the file. Grep for it after generating text-processing code: `grep -rlP '\x00' src`.

## Recurring Errors & Fixes

### 2026-09-20 — Skill Config tab's Save wrote a stale `enabled` back over a toggle flipped elsewhere
Three surfaces edit `skills.enabled`: the `/skills` list toggle and side-panel toggle (both PUT `{enabled}` immediately) and the Config tab, which copies it into local state once per `skill.id` and always sends it on Save. Enabling from the list and then saving the open Config tab re-disabled the skill (`test-coverage-nudge` sat at `enabled=f, version=3`). Fixed with a second effect keyed on `skill.enabled` in `SkillConfigTab.tsx`. Any form that holds a server-owned flag in local state AND sends it on save needs this re-sync. Related: the agent Skills tab's "N of M enabled" counts `agent_skills` links, not `skills.enabled`, so a globally disabled skill still counts.

### 2026-09-18 — `useDeleteReview` invalidated only its own cache key, leaving the Timeline stale
`useDeleteReview` (`lib/hooks/reviews.ts`) only invalidated `["reviews", prId]`
after deleting a review — not `["pr-runs", prId]`, the Timeline's query.
`pr-runs` only auto-refetches while a run is `status=running`
(`refetchInterval`), so after a review delete the Timeline kept showing a
stale tile until an unrelated refetch happened, even once the server-side fix
(see `server/INSIGHTS.md`, same date) made `reviews`/`agent_runs` consistent.
`useDeleteRun` already invalidated both keys correctly — `useDeleteReview` was
the asymmetric one. Fixed to invalidate both. **Lesson:** when two React Query
cache keys represent overlapping/related server state, check that EVERY
mutation touching either table's data invalidates BOTH keys, not just the one
whose data it most directly changed.

### 2026-09-18 — A hover-triggered panel clipped by an `overflow: hidden` ancestor: portal it, and re-attach hover handlers on the portaled element
`Popover.tsx` was first built like `Dropdown` — an absolutely-positioned panel
nested in the trigger's own DOM subtree. On the PR list, that panel got
clipped by `pulls/styles.ts`'s `tableCard.overflow: "hidden"` (used for the
table's rounded corners). Fix: render the panel via
`createPortal(..., document.body)`, `position: fixed`, computed from
`getBoundingClientRect()` on open. Gotcha: once portaled, the panel is no
longer a DOM descendant of the trigger, so `mouseenter`/`mouseleave` no longer
bubble/contain across the two — attach the SAME open/close handlers on both
the trigger wrapper and the portaled panel (sharing one close-timeout ref),
or moving the cursor from trigger to panel closes it instantly. If a future
overlay needs to render inside a clipped/`overflow:hidden` container, portal
it and don't assume hover state travels through the React tree the way DOM
nesting would provide it for free.

## Session Notes

## Open Questions

---

<!-- Add new entries above this line within the relevant section, newest first. -->
