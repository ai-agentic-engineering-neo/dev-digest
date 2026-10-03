---
name: frontend-ui-architecture
version: 1.0.0
description: "Component placement and code-organization rules for client/ (Next.js App Router): where a new piece of UI goes, when to split a component, and where constants/helpers/types/business-logic/styles live. Use when adding a component or page, asking 'where should this go', deciding whether to split a growing file, extracting a helper, or refactoring the folder layout. Does NOT cover React behavioural rules (purity, hooks, memoization, state-derivation) — use react-best-practices — or Server/Client Component mechanics — use next-best-practices."
---

# Frontend UI Architecture

Placement and decomposition rules for `client/` (`@devdigest/web`), calibrated
to this repo's actual layout, not generic React advice. For behavioural rules
(purity, hooks, memoization, conditional rendering, a11y) see
[react-best-practices](../react-best-practices/SKILL.md). For Server/Client
Component mechanics and Next.js data patterns see
[next-best-practices](../next-best-practices/SKILL.md). Sources and rationale
for every rule below: [README.md](README.md). Code examples: [examples.md](examples.md).

## Severity levels

- **CRITICAL** — will produce a structurally wrong placement or a hidden
  coupling that's expensive to unwind later
- **HIGH** — will hurt maintainability, discoverability, or scaling as the
  codebase grows
- **MEDIUM** — will hurt consistency or developer experience

---

## 1. The placement decision tree (CRITICAL)

When you have a new piece of UI, walk this in order:

1. **Does it exist in `src/vendor/ui` already?** (`Badge`, `Button`,
   `Skeleton`, `EmptyState`, `ErrorState`, `Icon`, `CircularScore`, …) Use it.
   `src/vendor/ui` is vendored (mirrors an upstream design-system package) —
   never add new components there; extend by composing, not editing.
2. **Does only one route use it, or will it foreseeably stay that way?**
   Put it in that route's own `src/app/**/_components/<PascalName>/`, next
   to `page.tsx`. This is the default for almost everything you write.
3. **Do two *unrelated* routes need it right now?** Promote it to
   `src/components/<kebab-case>/`. Not "might need it later" — an actual
   second caller, today.
4. **Is it cross-cutting chrome** (nav, breadcrumbs, shell-level shortcuts)?
   That's also `src/components/<kebab-case>/` (e.g. `app-shell`,
   `page-shell`).

The casing is the tell: route-local folders are `PascalCase`
(`_components/PRRow/`, `_components/RunHistory/`), the shared bucket is
`kebab-case` (`components/run-cost-badge/`, `components/findings-popover/`).
If you're naming a folder and unsure which bucket it's in, the casing you'd
naturally reach for is a hint at where it belongs.

### Colocate first, extract later

Don't build a component in `src/components/` speculatively because it "feels
reusable." Build it where it's used. Promote only when a second, unrelated
caller actually needs it — general principle (Kent C. Dodds' colocation,
Next.js's private-folder convention): code that changes together should live
together, and premature sharing creates a coupling you have to guess at
before you have real usage data.

**Worked precedent in this repo:** the findings hover-preview popover started
as inline UI inside `PRRow/FindingsCell.tsx` (the PR list). When the PR
detail page's Agent Runs timeline (`RunHistory.tsx`) needed the identical
popover for a second, unrelated route, it was extracted to
`src/components/findings-popover/FindingsPopover.tsx` and both call sites
now import it. It was not pre-extracted "just in case" — see
`client/INSIGHTS.md`'s 2026-09-20 "Timeline pills got the wrong interaction
TWICE" entry for the full story. Don't pre-emptively create the shared
version; wait for the second caller like this one did.

---

## 2. Anatomy of a component folder (HIGH)

A route-local or shared component folder can carry up to six files, all
colocated, all scoped to that one component:

| File | Load-bearing? | Holds |
|---|---|---|
| `<Name>.tsx` | required | the component itself |
| `<Name>.test.tsx` | expected for anything with logic | the RTL test |
| `constants.ts` | optional | literal config for this component only |
| `helpers.ts` | optional | pure functions extracted out of the component body |
| `styles.ts` | optional | the colocated `styles.ts` object (see §9) |
| `index.ts` | required once anything else imports it | the barrel — see §10 |

Not every folder needs all six — `RunHistory/` (267 lines) has only
`RunHistory.tsx` + `RunHistory.test.tsx` because its style/constant surface
is small enough to stay inline; `AgentCard/` has all six because its model→
colour mapping (`constants.ts`) and lookup (`helpers.ts`) are worth naming
separately. Add a file when the component actually needs that concern
separated out — don't scaffold empty ones.

### Nested `_components/`

A folder earns its own nested `_components/` when it decomposes into
sub-pieces that only it uses — e.g.
`RunTraceDrawer/_components/{FindingsSection,PromptBlock,PromptModalBody,
ToolCallRow,TraceBody,TraceSection}/`, or
`AgentsListView/_components/CreateAgentModal/`. Same PascalCase rule inside
the nested folder as outside it.

### The `atoms.tsx` escape hatch

For trivial presentational pieces that will never be meaningfully tested
alone or reused outside their parent's `_components/` folder, group them in
one `atoms.tsx` instead of giving each its own folder+`index.ts`. See
`RunTraceDrawer/_components/atoms.tsx` (`Stat`, `Row` — two tiny layout
primitives used only by `TraceBody`). Use this only for genuinely trivial,
untested-alone pieces — anything with real logic or its own test still gets
a full folder.

---

## 3. When to split a component (HIGH)

Split on a **problem**, not a line count. Extract a piece out when you hit
one of:

- a second, distinct loading/error surface within the same component
- a distinct data dependency (a different query, a different domain)
- a JSX fragment a sibling component also needs
- prop count creeping past ~5-7 (a signal the component does too much, not
  a hard rule)

Do **NOT** split just because a file crossed some line-count threshold —
that manufactures pass-through wrapper components that only add indirection
without separating a real concern. `RunHistory.tsx` stays a single 267-line
file with no wrapper because nothing in it hits one of the problems above;
`RunTraceDrawer` decomposes into six nested components because it genuinely
has six distinct concerns (trace body, per-tool-call rows, two kinds of
modal content, two collapsible sections). Neither file exceeds ~270 lines
*because* `styles.ts`/`constants.ts`/`helpers.ts` are colocated siblings
pulling weight out of the component file — not because logic was hidden
inside wrapper components to make one file look smaller.

"Split for performance" (to scope re-renders) is now a weak reason on its
own — React Compiler (v1.0) auto-memoizes render output, so a manual split
motivated only by re-render scope should be justified by measurement, not
assumed. Split for clarity and separated concerns; let the compiler handle
re-render scoping.

---

## 4. Where business logic lives (CRITICAL)

Four layers, each with exactly one job:

1. **`src/lib/api.ts`** — the only file that calls `fetch`. Normalizes every
   non-2xx response into `ApiError` (`status`/`code`/`details`).
2. **`src/lib/hooks/<domain>.ts`** — the only callers of `api`. One file per
   domain (`core.ts`, `agents.ts`, `reviews.ts`, `trace.ts`,
   `repo-intel.ts`), named after the *domain*, not the hook
   (`agents.ts` → `useAgents`/`useAgent`/`useCreateAgent`/`useDeleteAgent`).
   Re-exported from `src/lib/hooks/index.ts`.
3. **View component** — calls the hook(s), branches on loading/error/empty,
   passes data down.
4. **Presentational component** — props in, JSX out, no fetching.

A component never calls `fetch` or `api.*` directly — only a hook does that.
This is enforced by convention, not lint, so check it in review.

Rules specific to this layer:

- **Query keys are domain-prefixed arrays** and must contain every variable
  the `queryFn` reads: `["pulls", repoId]`, `["pull", prId]`,
  `["run-trace", runId]`, `["pr-runs", prId]`. If the `queryFn` closes over
  a variable that isn't in the key, a stale cache entry can be served for
  the wrong argument.
- **Mutations invalidate the affected key(s) in `onSuccess`** —
  `useDeleteRun`'s `onSuccess` invalidates both `["pr-runs", prId]` and
  `["reviews", prId]` because deleting a run also deletes the review it
  produced server-side.
- **Global error toasting is already wired once**, in
  `src/lib/providers.tsx`'s `QueryCache`/`MutationCache` `onError` (network
  failures and 5xx always toast; mutations always toast). A component only
  needs its own inline state for an *expected* 4xx (empty state, "not
  found") — don't add a second toast for errors the global handler already
  surfaces.

Grounded in React's "You Might Not Need an Effect" (data fetching belongs in
an event handler or a framework-level hook, not scattered `useEffect`s) and
TkDodo's query-abstraction posts (hooks — or `queryOptions` factories — as
the seam between components and the network, not raw `useQuery` in a
component body).

---

## 5. Constants (HIGH)

Colocate by blast radius:

- **Component-local `constants.ts`** beside the component — the default (14
  of the 17 component-local `constants.ts` files in this repo). E.g.
  `AgentCard/constants.ts` (`MODEL_COLOR`).
- **Route-level `constants.ts`** beside `page.tsx`, when several sibling
  `_components/` in that route share it — e.g.
  `src/app/repos/[repoId]/pulls/constants.ts` (`STATUS_META`, `SIZE_COLOR`,
  `GRID`, `COLUMN_KEYS`, …), shared across `PRRow`, `FilterBar`, and the
  route's `page.tsx`.
- **Never a central `src/constants/`.** Nothing here is global config; it's
  all scoped to what renders it.

Values that cross the client/server boundary (anything the API also cares
about) belong in the shared Zod contracts (`@devdigest/shared`), not in a
`constants.ts` — a constants file is UI-only display config (colours,
thresholds, column layout), never a duplicate of a server-defined shape.

Shape: `as const` objects with a derived union type, not TypeScript `enum` —
`enum` generates runtime code, doesn't structurally widen the way object
literals do, and has surprising numeric-enum behavior (Pocock, "Why I Don't
Like TypeScript Enums"). `pulls/constants.ts`'s `PrSize = "S" | "M" | "L"`
derived from a literal union is the pattern to follow.

---

## 6. Helpers and utils (HIGH)

Pure functions belong outside the component body regardless of where they
end up living — never redefine a helper inline on every render.

**The extraction test:** once a function is already outside the component
body, decide where it lives — pull it into `helpers.ts` when it's pure,
nameable, and either used twice or genuinely hard to read inline. "You can ask yourself 'haven't I written this before?'
two times, but never three" (AHA programming) — the third repetition is
where you extract, not the first.

- **Colocated `helpers.ts`** is the default — scoped to one component
  (`AgentCard/helpers.ts`'s `modelColor`, `FindingCard/helpers.ts`).
- **Promote to a concern-named module under `src/lib/`** once a second,
  unrelated folder needs it — never a `utils.ts` grab bag. This repo's
  actual promoted helpers are concern-named:
  `src/lib/findings.ts` (`countBySeverity`, `latestReviewPerAgent`),
  `src/lib/github-urls.ts`, `src/lib/model-label.ts`.

**Live candidate flagged in this repo:** `computeFlip`/`findClipBoundary` in
`src/components/findings-popover/helpers.ts` hand-roll flip-to-fit
positioning because no floating-UI library (`@floating-ui/react`,
`@popperjs/core`, `@radix-ui`) is installed. If a second floating panel ever
needs the same collision logic, that's the signal to promote these two
functions to `src/lib/` rather than reaching for a library — see
`client/INSIGHTS.md`'s 2026-09-21 entry.

---

## 7. Types (HIGH)

- **`@devdigest/shared` is the single source of truth** for any shape the
  API also knows about. Import it as `@devdigest/shared` (the path-alias
  package name) — never `@/vendor/shared`, even though both resolve to the
  same file (`tsconfig.json`). The raw path is a known loophole flagged in
  `client/INSIGHTS.md`; don't let it spread.
- **Never hand-duplicate a contract shape.** If a type isn't exported from
  `@devdigest/shared` yet, that's a gap to close upstream, not a reason to
  redefine it locally.
- **`src/lib/types.ts`** is a re-export barrel for `@devdigest/shared` types
  plus genuinely UI-only view models that don't exist server-side —
  `PrRowView` (derives `size`/`sizeLines`/`status` display fields from
  `PrMeta` for one list row).
- **Component props are typed inline** (`{ ag, active, onClick }: {...}`)
  unless the type is exported and reused — don't create a named `Props`
  type for a shape only one component uses.

---

## 8. State placement (HIGH)

A ladder, cheapest first — stop at the first rung that actually solves the
problem:

1. **Derive it.** If it can be computed from existing props/state, don't
   store it (see react-best-practices' "Derive, Don't Store" for the
   mechanics).
2. **Local `useState`** in the component that uses it.
3. **Lift to the least common parent** that needs to share it — no higher.
4. **URL search params** for anything that should survive a refresh or be
   shareable (filters, pagination, active tab).
5. **Server cache (TanStack Query)** for anything the API is the real
   source of truth for — don't shadow query data in local state.
6. **Context** — last resort, and in this repo it's DI-only: `theme`,
   `toast`, `repo-context` are flat `src/lib/*.tsx` modules, not a
   general state-management mechanism. See react-best-practices' Context
   API rules for the re-render implications.

Abramov's isolation test decides local vs. lifted: *if this component
rendered twice on the same screen, should the interaction in one reflect in
the other?* If no, it's local state, not lifted or global. Five buckets
worth distinguishing when you reach for state: component, application
(cross-cutting UI like theme), server-cache (TanStack Query), form, and URL.

For hook-level rules (dependency arrays, `useReducer` vs. multiple
`useState`, memoization), see react-best-practices — this section only
covers *where* the state lives, not how the hook is written.

---

## 9. Styles (MEDIUM)

Colocated `styles.ts` exporting a single `s` object of `CSSProperties`,
`satisfies`-checked, referencing design tokens through CSS vars
(`var(--bg-elevated)`, `var(--text-muted)`) — e.g. `AgentCard/styles.ts`,
`RunTraceDrawer/styles.ts`. No CSS modules, no styled-components.

**This package has no Tailwind.** `react-best-practices`' Tailwind section
does not apply to `client/` — ignore it here.

---

## 10. Barrels and imports (MEDIUM)

- Every **leaf** component folder gets an `index.ts` re-export:
  `export { PRRow } from "./PRRow";`. Import the folder, not the deep file.
- Intermediate `_components/` containers (the folder that just groups
  several sibling components) do **not** get their own barrel.
- Never add non-re-export code to an `index.ts` — it's a barrel, not a
  module.

**Known violation, don't copy it:** `FindingsTab.tsx` imports
`RunHistory` via `from "../RunHistory/RunHistory"` instead of
`from "../RunHistory"`, bypassing `RunHistory`'s own `index.ts` re-export.
Fix forward when you touch this file; don't propagate the pattern to new
imports.

**Be aware this is a live disagreement in the field**, not a settled
question: TkDodo and bulletproof-react argue against barrels entirely
(bundler cost, circular-import risk); Feature-Sliced Design keeps exactly
one `index.ts` per component/slice with no wildcard re-exports. This repo's
rule sits closest to FSD's: a per-component `index.ts` is fine and expected,
a *barrel of barrels* (an `index.ts` that re-exports other `index.ts`
files) is not, and nothing beyond re-exports goes in one.

---

## 11. Server/Client boundary (MEDIUM)

This section states only the *placement* consequences for `client/`; for
the RSC mechanics themselves (`"use client"` rules, streaming, server
actions) see next-best-practices.

- `src/app/layout.tsx` is the **one** real Server Component boundary in
  this app — everything below it is effectively a client-rendered app under
  one server-rendered shell, not a page that "happens to need client
  behavior in a few spots."
- Three `page.tsx` files really are thin re-exports of a `_components/<View>`
  (`agents/page.tsx`, `onboarding/page.tsx`, `settings/[section]/page.tsx`);
  four are not and contain real logic inline (`src/app/page.tsx`,
  `agents/[id]/page.tsx`, `repos/[repoId]/pulls/page.tsx`,
  `repos/[repoId]/pulls/[number]/page.tsx`). **Never assume a `page.tsx` is
  a dumb wrapper** — check it.
- `"use client"` marks the *entry point* to a client subtree, not every file
  under it — don't add it to a file that's only ever imported by an already-
  client component.
- Push provider components as deep in the tree as their scope actually
  requires, rather than defaulting everything into the root layout.

---

## 12. Anti-pattern quick table

| Anti-pattern | Why it's wrong here |
|---|---|
| A central `src/utils/` or `src/constants/` | Nothing is colocated; everyone stops knowing what's actually used where — see §5, §6 |
| A parallel `src/features/` tree | Route-local `_components/` already is the feature boundary; a second tree duplicates it |
| A `src/types/` folder | `@devdigest/shared` is the source of truth; `src/lib/types.ts` is the only local re-export point — see §7 |
| Barrel-of-barrels (`index.ts` re-exporting other `index.ts`) | Defeats tree-shaking clarity and hides the real import graph — see §10 |
| Promoting to `src/components/` before a second caller exists | Guesses at a shared API before real usage data — see §1 |
| A page-level god component instead of `_components/<View>` decomposition | Recreates exactly the coupling `_components/` exists to avoid |
| Deep relative imports past a folder's `index.ts` | Bypasses the barrel; breaks if the internal file moves — see §10 |
| Hand-duplicating a contract shape instead of importing `@devdigest/shared` | Silently drifts from the server's actual type — see §7 |
