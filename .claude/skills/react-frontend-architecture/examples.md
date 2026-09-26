# Examples

Before/after pairs for the rules in `SKILL.md`, drawn from the shapes that
occur in `client/src`. Paths are illustrative; the point is the move, not the
exact names.

## 1. A page that is really a view

**Before:** `src/app/repos/[repoId]/pulls/page.tsx` is `"use client"`, reads
URL params, owns `query` and `sort` state, runs the filter → sort chain and
the `openCount` derivation inline, and renders the shell. The route already
has `constants.ts`, `helpers.ts` (`sizeOf`, `relativeTime`) and `styles.ts`
beside it, so only the page body and `OPEN_STATUSES` are out of place.

**After:**

```
src/app/repos/[repoId]/pulls/
├── page.tsx                      # server, no directive: return <PullsView />
└── _components/
    └── PullsView/
        ├── PullsView.tsx         # "use client"; wires params + hooks to the list
        ├── helpers.ts            # filterPulls(), sortPulls(), countOpen()
        ├── helpers.test.ts
        ├── constants.ts          # OPEN_STATUSES, COLUMN_KEYS, SKELETON_ROWS
        └── styles.ts
```

```ts
// helpers.ts — plain functions, no React import, tested without rendering
export function filterPulls(pulls: PullSummary[], status: string, query: string) { ... }
export function sortPulls(pulls: PullSummary[], sort: "newest" | "oldest") { ... }
export function countOpen(pulls: PullSummary[]) { ... }
```

```tsx
// page.tsx
import { PullsView } from "./_components/PullsView";
export default function PullsPage() { return <PullsView />; }
```

Why: the page file stays a Server Component, the derivations get unit tests,
and the `"use client"` boundary moves one level down where the hooks are.

## 2. Hook or plain function?

**Before**

```ts
export function useSortedRuns(runs: RunSummary[], order: "asc" | "desc") {
  return React.useMemo(() => [...runs].sort(byRanAt(order)), [runs, order]);
}
```

**After**

```ts
// helpers.ts
export function sortRuns(runs: RunSummary[], order: "asc" | "desc") {
  return [...runs].sort(byRanAt(order));
}
// in the component
const sorted = sortRuns(runs, order);
```

It calls no hook, so it is not a hook. Add `useMemo` back only if profiling
shows the sort is expensive.

## 3. Render helper → component

**Before**

```tsx
function RunHistory({ runs }) {
  const renderRow = (run) => (
    <tr key={run.run_id}>...</tr>
  );
  return <table><tbody>{runs.map(renderRow)}</tbody></table>;
}
```

**After**

```tsx
// _components/RunRow/RunRow.tsx
export function RunRow({ run }: { run: RunSummary }) { return <tr>...</tr>; }

// RunHistory.tsx
return <table><tbody>{runs.map((r) => <RunRow key={r.run_id} run={r} />)}</tbody></table>;
```

`RunRow` starts as `_components/RunRow.tsx` beside `RunHistory.tsx` and gets
its own folder only when it acquires styles, constants, or a test. One
component per file; a `rows.tsx` holding three small components is the
thing to avoid.

## 4. Formatting once, in the domain layer

**Before:** three components each do `usd == null ? "—" : "$" + usd.toFixed(2)`.

**After:** `src/lib/format-cost.ts` exports `formatCost()` with its own test,
and every component imports it. The rule that `0` is a real price while
`null` is "no data" now exists in exactly one place.

## 5. Constants: innermost folder that covers all consumers

| Constant | Where |
|---|---|
| `SKELETON_ROWS = 6` used by one list | `constants.ts` beside that list component |
| `OPEN_STATUSES` used by the pulls list and the PR header | route-level `constants.ts` under `pulls/` |
| A cost display threshold used by the badge and the trace drawer | `src/lib/format-cost.ts`, next to `formatCost()` which reads it |
| Severity colors | `SEV` map in `@devdigest/ui`; never a local copy |

## 6. Server data is not component state

**Before**

```tsx
const { data } = usePrRuns(prId);
const [runs, setRuns] = React.useState<RunSummary[]>([]);
React.useEffect(() => { if (data) setRuns(data); }, [data]);
```

**After**

```tsx
const { data: runs = [] } = usePrRuns(prId);
```

React Query already owns that data. A local copy goes stale and forces an
effect that exists only to sync.

## 7. URL state is not component state

**Before:** `const [tab, setTab] = useState("findings")` on a page whose tab
should survive reload and be linkable.

**After:** read `searchParams.get("tab") ?? "findings"` and write with
`router.replace`. The component-state version is right only for state that
should reset on navigation (an open menu, a draft).

## 8. Context as injection, not a store

**Good:** `RepoProvider` resolves the active repo once from URL, storage and
the repos query, and `useActiveRepo()` throws outside the provider. Every
repo-scoped page reads the same resolved value.

**Bad:** a `UiContext` holding `isSidebarOpen`, `selectedFindingId`,
`sortOrder`. Each of those has one owner: the sidebar, the findings panel, the
list. Keep them there and pass props; lift to the closest common parent only
when two siblings need one.

## 9. Depth budget

**Before**

```
pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/_components/ToolCallRow/
```

**After**

```
pulls/[number]/_components/RunTraceDrawer/
pulls/[number]/_components/TraceBody/            # promoted: it is a screen-sized piece
pulls/[number]/_components/TraceBody/_components/ToolCallRow/
```

Two `_components` levels under a route is the budget. A third level says the
middle folder is a screen, not a sub-component.

## 10. Barrels

**Allowed**

```ts
// _components/FilterBar/index.ts
export { FilterBar } from "./FilterBar";
```

Existing folders that also export `FilterBar as default` stay as they are;
new folders export the name only, and pages import the name.

**Not allowed**

```ts
// src/lib/hooks/index.ts  (aggregate; every consumer pulls every domain)
export * from "./core";
export * from "./reviews";
```

New code imports `@/lib/hooks/reviews` directly. Inside `FilterBar/`, files
import `./FilterBar`, never `.` or `./index`.

## 11. Enforcing import direction

The client has no boundary rule yet. The server package already uses
dependency-cruiser (`pnpm lint:arch`, baseline file for legacy violations) as
the source of truth and mirrors the rules as ESLint warnings; do the same
here so both packages fail CI the same way. Add `dependency-cruiser` to the
client's devDependencies (`pnpm add -D dependency-cruiser`); the ESLint
mirror needs no plugin because `no-restricted-imports` is a core rule.

```js
// client/.dependency-cruiser.cjs
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    { name: 'lib-never-imports-app', severity: 'error',
      comment: 'src/lib is the inner layer: hooks, api, topic helpers. Routes depend on it, never the reverse.',
      from: { path: '^src/lib/' }, to: { path: '^src/app/' } },
    { name: 'lib-never-imports-components', severity: 'error',
      comment: 'Hooks and helpers do not render; keep src/lib free of UI.',
      from: { path: '^src/lib/' }, to: { path: '^src/components/' } },
    { name: 'components-never-import-app', severity: 'error',
      comment: 'Cross-route UI cannot depend on one route.',
      from: { path: '^src/components/' }, to: { path: '^src/app/' } },
    { name: 'no-cross-route-private-imports', severity: 'error',
      comment: 'A route never reaches into another route\'s _components. Promote to src/components instead.',
      from: { path: '^src/app/([^/]+)/' },
      to: { path: '^src/app/([^/]+)/.*/_components/', pathNot: '^src/app/$1/' } },
    { name: 'no-aggregate-barrels', severity: 'warn',
      comment: 'Import the domain file, not the hooks barrel.',
      from: { path: '^src/' }, to: { path: '^src/lib/hooks/index\\.ts$' } },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '^src/vendor/' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
  },
};
```

```json
// client/package.json scripts
"lint:arch": "depcruise --config .dependency-cruiser.cjs --ignore-known .dependency-cruiser-known-violations.json src",
"lint:arch:baseline": "depcruise --config .dependency-cruiser.cjs --output-type baseline --output-to .dependency-cruiser-known-violations.json src"
```

```js
// client/eslint.config.mjs — editor mirror, warnings only, no extra plugin needed
{
  files: ["src/lib/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": ["warn", { patterns: [
      { group: ["@/app/*", "**/app/*"], message: "arch: src/lib never imports routes." },
      { group: ["@/components/*"], message: "arch: src/lib does not render; keep UI out." },
    ] }],
  },
},
{
  files: ["src/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": ["warn", { patterns: [
      { group: ["@/lib/hooks"], message: "arch: import the domain file (@/lib/hooks/reviews), not the barrel." },
    ] }],
  },
},
```

Regenerate the baseline only when a violation is accepted or removed on
purpose; otherwise new violations fail `lint:arch`.

Run on 2026-09-25 against `client/src`: 0 errors, 8 warnings, every warning
an import of `@/lib/hooks` (the aggregate barrel). Import direction and route
privacy were already clean, so the rules cost nothing to adopt.

## 12. When to create `src/features/<domain>/`

Not yet. The trigger is a domain whose components, hooks and helpers are
used by two or more routes *and* currently spread over `src/components/`,
`src/lib/hooks/` and `src/lib/`. At that point:

```
src/features/reviews/
├── api/reviews.ts        # was src/lib/hooks/reviews.ts
├── components/RunStatus/ # was pulls/[number]/_components/RunStatus
└── helpers.ts
```

Routes compose features; features never import each other or `src/app`.
