# Insights — client

Learnings for `@devdigest/web`: App Router behaviour, data hooks, the vendored UI
kit, i18n, and component testing.

**Fixed sections — append to the matching one, never to the bottom of the file.**
If an entry fits nowhere here, it probably belongs in `docs/` or nowhere at all.

How to write one: 1–3 lines, newest first inside its section, recording what a
careful reader could not have predicted from the code. Not a task log, not a
changelog, not a restatement of the diff. When an entry has bitten a third time,
promote it to `CLAUDE.md` — § Conventions for a pattern, § Gotchas for a trap —
and leave it here as history.

## What Works

Approaches and solutions that held up, with the context that made them work.

_None yet._

## What Doesn't Work

Dead ends and anti-patterns: what was tried, why it failed, what to do instead.
**The highest-value section and the one most often left empty. Fill it.**

- **An absolutely-positioned hover card inside the PR list gets clipped: the table card is `overflow: hidden`.** (2026-09-17) `src/app/repos/[repoId]/pulls/styles.ts:88` sets it on `tableCard`, so a card anchored in a row is cut at the table edge — worst on the last rows, where it is invisible rather than merely trimmed.
  → Position hover cards `fixed` off the trigger's `getBoundingClientRect()` and flip above when there is no room below, as `src/components/findings-summary/FindingsPopover.tsx:24` does.

## Codebase Patterns

Conventions and architectural decisions found while working here, before they are
settled enough to move into `CLAUDE.md`.

- **`[number]/_components/` is flat, but its real ownership tree is four levels deep and each of its twelve components has exactly one importer.** `page.tsx` imports only PrDetailHeader/OverviewTab/FindingsTab/DiffTab/RunTraceDrawer; FindingsTab owns RunStatus, RunHistory and ReviewRunAccordion, which owns VerdictBanner and FindingsPanel, which owns FindingCard. `RunTraceDrawer/_components/` in the same folder already nests its parts, so the flat siblings are the inconsistency, not the pattern.
  → Nesting them all would push past the 3-4 level folder-depth cap, so treat this route as a feature that outgrew `_components/` rather than flattening further; a new component goes under the single parent that renders it.

- **A helper two sibling `_components/` folders share moves to a route-level `helpers.ts`/`constants.ts` in the route segment, not to `src/components/<kebab>/`.** `src/app/repos/[repoId]/pulls/constants.ts` and `helpers.ts` are imported as `../../constants` by both `_components/PRRow/PRRow.tsx:11` and `_components/FilterBar/FilterBar.tsx:7` alongside `page.tsx:19`; the `src/components/<kebab>/` tier is reserved for a second *route*, and CLAUDE.md § Naming conventions names only `_components/<Name>/` and `src/components/<kebab-case>/`, so the route-level slot is invisible until you find it.
  → Promote a shared route-local helper to the nearest common parent segment first; reach for `src/components/<kebab>/` only when a different route renders it.

## Tool & Library Notes

Quirks of dependencies, versions and tooling — what a library does that its docs
do not say.

- **A static route that calls `useSearchParams()` does NOT fail `next build` on Next 15.5 — the Next-14-era "should be wrapped in a suspense boundary" error never fires.** (2026-09-21) `/skills` was built both with and without the boundary in `src/app/skills/page.tsx`; both runs were green and the route stayed `○ (Static)` in the output table either way. The boundary still earns its place — without one the tree above `useSearchParams()` falls back to client rendering — but it is a rendering decision, not a build gate.
  → Do not add `<Suspense>` "because the build will fail", and do not trust a comment that says so; prove a build gate by removing the guard and running `pnpm build` before writing it down.

- **`MonoLink` renders a `<button>` when it is given no `href`.** (2026-09-17) `src/vendor/ui/primitives/MonoLink.tsx:42` returns a focusable `<button>`; the `<a>` is emitted only on the href branch, so reusing the primitive on a read-only surface silently adds a control and a tab stop where the design says there is none.
  → On a read-only surface render `file:line` as a plain `<span className="mono">`; keep `MonoLink` for references that really navigate.

- **A bare ICU argument does not group digits: `{count} tok` renders `9119 tok`.** next-intl passes values to intl-messageformat (10.7.18), where only a typed argument gets `Intl.NumberFormat` — `{count, number} tok` is what produces `9,119 tok`. Verified directly against the bundled formatter, not inferred from the docs.
  → Type every message argument that can exceed 999 as `{x, number}`; a plain `{x}` silently ships ungrouped digits that no type or lint check will catch.

- **Grepping rendered Next.js HTML for `This page could not be found` gives false
  positives.** The string ships inside the RSC flight payload (`<script>self.__next_f…`)
  on pages that render fine, so a plain `curl | grep` reports a 404 that is not there.
  → Check the HTTP status first, and strip `<script>`/`<style>` before matching text.

## Recurring Errors & Fixes

Error or symptom → cause → fix, one entry each, so the next occurrence is a lookup
instead of an investigation.

- **A vitest hook that RETURNS a function gets that function called as teardown — and `mock.mockReset()` returns the mock itself, which is callable.** (2026-09-22) `beforeEach(() => mutateAsync.mockReset())` (implicit-return arrow) made vitest invoke the mock again after the test body finished; with a throwing implementation set inside the test, the failure surfaced as `ApiError: …` attributed to a test whose assertions had all passed, and `mock.calls.length` still read 1 while the body ran. Bisected in `CreateSkillModal.test.tsx`: deleting the hook fixed it, swapping `mockReset`→`mockClear` did not, a block body did.
  → Always give a mock-resetting hook a BLOCK body: `beforeEach(() => { m.mockReset(); })`. The same trap waits on `mockClear`, `mockImplementation`, `mockReturnValue` — every one of them returns the mock. An unexplained error carrying a test-fixture message, after the assertions passed, is this.

- **The client's vendored `@devdigest/shared` is a TYPE-only dependency: importing a VALUE from it type-checks, passes vitest, and then fails `next build`.** (2026-09-22) `src/vendor/shared/index.ts` re-exports with `.js` specifiers (`./contracts/findings.js`) against `.ts` sources; `tsc` and vite resolve that, Next's webpack does not — `import { SkillType } from "@devdigest/shared"` in `src/app/skills/constants.ts` produced `Module not found: Can't resolve ./contracts/findings.js`, naming a file the importer never mentions. Every pre-existing client import from that path is `import type`, so nothing had hit it before.
  → In `client/`, import only types from `@devdigest/shared`. When a zod enum's VALUES are needed (select options, an allow-list), write the literal tuple locally and guard it with `type Missing = Exclude<TheUnion, (typeof LOCAL)[number]>` — a contract change then breaks the build instead of drifting. `pnpm typecheck` + `pnpm test` cannot catch this; only `pnpm build` can.

- **`Updating a style property during rerender (borderColor) when a conflicting property is set (borderLeftColor)` — React counts `borderColor` and `borderWidth` as SHORTHANDS too.** (2026-09-19) `FindingCard/styles.ts:5` had already dropped the `border` shorthand and even carried a comment claiming it was safe, yet still paired `borderColor` with `borderLeftColor`; the warning fires only on the rerender that changes the value, which is why `focused` toggling (j/k navigation) surfaced it and the first render never did.
  → A per-side value means per-side longhand all the way: `borderTop/Right/Bottom/LeftColor` and the matching `*Width`. Guarded by the test "re-renders with a different focus state without a React style warning" in `FindingCard.test.tsx`.

- **`Unable to find an element with the text: $0.0013` while the badge visibly renders it.** (2026-09-17) `RunCostBadge` variant `detailed` emits the token count and the cost as two text nodes of ONE span (`src/components/run-cost/RunCostBadge.tsx:47`), and Testing Library matches text per element, not per node — two cost assertions in `RunHistory.test.tsx` were red from the day they were written.
  → Assert the joined text (`getByText("150 tok · $0.0013")`) or pass a regex; never an exact string for half of a multi-node element.

## Session Notes

Dated summaries as `### YYYY-MM-DD — topic`: what was worked on and what state it
was left in. Prune an entry once its content has moved into a section above.

_None yet._

## Open Questions

Unresolved behaviour, undecided design, unverified assumptions. Delete an entry when
it is answered — the answer belongs in another section.

- **Unverified in a browser: `<Markdown>` headings and lists probably render as plain body text.** (2026-09-23) `src/vendor/ui/styles.css:1` is `@import "tailwindcss"`, whose v4 preflight resets `h1`–`h6` to inherited size/weight and strips list bullets, and `src/vendor/ui/primitives/Markdown.tsx` styles only `p`, `strong`, `code` and `a`; nothing targets `.dd-md`. This is the surface behind the skill Preview tab (hw2 criterion 26: "rendered, not raw markdown").
  → Open a skill with `##` headings and `-` lists in Preview; if they look like paragraphs, add heading/list styles under `.dd-md` (or component overrides) and move this entry to Tool & Library Notes.

- **Unverified: whether a shared `src/components/*` component forces every test that renders it to register the `common` namespace.** `RunCostBadge` takes its copy from `common`, while `RunHistory.test.tsx` passed only `{ prReview }` to `NextIntlClientProvider`; `common` was added preemptively and no test run has shown whether next-intl throws there or quietly renders the key path.
  → Settle it on the next `client` test run; if it throws, this is a rule for every shared component and belongs in Codebase Patterns.
