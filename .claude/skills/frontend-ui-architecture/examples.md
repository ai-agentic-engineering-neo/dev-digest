# Examples

Worked patterns for [SKILL.md](SKILL.md). Every example is drawn from
`client/src` in this repo — including the violations, which are real.

---

## 1. Thin route files

The repo already does this correctly in three routes and incorrectly in two.
That contrast is the clearest statement of the rule.

### GOOD — `app/agents/page.tsx`

```tsx
import { AgentsListView } from "./_components/AgentsListView";

/* Route: /agents (Agents list). Thin route entry — the view, its create modal,
   styles, constants, helpers and i18n are colocated under _components/AgentsListView. */
export default function AgentsPage() {
  return <AgentsListView />;
}
```

7 lines. The route names a screen; the screen owns everything else. Same shape in
`app/settings/[section]/page.tsx` and `app/onboarding/page.tsx`.

### BAD — `app/repos/[repoId]/pulls/page.tsx`

135 lines. Abridged:

```tsx
"use client";                                    // ← whole route is now client

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { usePulls, useRefreshRepo } from "@/lib/hooks";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { COLUMN_KEYS, SKELETON_ROWS } from "./constants";
import { PRRow } from "./_components/PRRow";

/** Open PRs carry a derived review status; everything else is merged/closed. */
const OPEN_STATUSES = new Set(["needs_review", "reviewed", "stale"]);   // ← domain rule

export default function PullsPage() {
  const params = useParams<{ repoId: string }>();
  const search = useSearchParams();                // ← query parsing
  const { data: pulls, isLoading } = usePulls(repoId);   // ← fetching
  // …filtering, sorting, rendering
}
```

Four responsibilities in the route file: query parsing, fetching, a domain rule,
and rendering.

### Refactor

```tsx
// app/repos/[repoId]/pulls/page.tsx          — the whole file
import { PullsListView } from "./_components/PullsListView";

export default function PullsPage() {
  return <PullsListView />;
}
```

```
app/repos/[repoId]/pulls/
├── page.tsx
└── _components/
    ├── PullsListView/
    │   ├── PullsListView.tsx      "use client" lives HERE
    │   ├── PullsListView.test.tsx renders without a router mock for the route
    │   ├── constants.ts           COLUMN_KEYS, SKELETON_ROWS, OPEN_STATUSES
    │   ├── helpers.ts             filter/sort — pure, unit-testable
    │   └── index.ts
    ├── PRRow/
    └── FilterBar/
```

What this buys, concretely: `OPEN_STATUSES` and the sort comparator become pure
functions callable from a unit test with no React at all; `PullsListView` renders
in RTL directly; and `page.tsx` goes back to being a Server Component.

`app/repos/[repoId]/pulls/[number]/page.tsx` has the same shape and the same fix.

---

## 2. `_components` does not nest

### BAD — real path in this repo

```
app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceSection/TraceSection.tsx
```

11 path segments. The second `_components` is the signal: `RunTraceDrawer` has
grown its own component tree — `TraceBody`, `TraceSection`, `ToolCallRow`,
`PromptBlock`, `PromptModalBody`, `FindingsSection`. That is not a component
anymore, it is a feature.

### GOOD

```
src/features/run-trace/
├── components/
│   ├── RunTraceDrawer/
│   ├── TraceBody/
│   ├── TraceSection/
│   ├── ToolCallRow/
│   ├── PromptBlock/
│   └── FindingsSection/
├── hooks/
├── constants.ts
└── index.ts          → export { RunTraceDrawer }
```

The route now imports one name:

```tsx
import { RunTraceDrawer } from "@/features/run-trace";
```

Flat inside the feature, one public entry, and the deepest path drops from 11
segments to 5.

---

## 3. Imports

### BAD — both styles in one file (`pulls/[number]/page.tsx`)

```tsx
import { AppShell } from "../../../../../components/app-shell";   // ← 5 levels up
import { RepoNotFound } from "@/components/repo-not-found";       // ← alias
import { usePullDetail, usePulls } from "../../../../../lib/hooks";
```

The alias is configured (`"@/*": ["./src/*"]`) and used inconsistently in the
same file. A moved file silently breaks the relative ones.

### GOOD

```tsx
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { usePullDetail, usePulls } from "@/lib/hooks";
import { PrDetailHeader } from "./_components/PrDetailHeader";   // sibling — relative is right
```

Rule: `@/` for anything outside the current folder; relative only for siblings.

Enforce it:

```js
// eslint.config.mjs
{
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [{
        group: ["../../*"],
        message: "Use the @/ alias for anything outside the current folder.",
      }],
    }],
  },
}
```

---

## 4. Barrels — the allowed two

### GOOD — component folder, one line

```ts
// components/diff-viewer/CodeLine/index.ts
export { CodeLine } from "./CodeLine";
```

### GOOD — a module's public surface, named exports only

```ts
// components/diff-viewer/index.ts
/* diff-viewer — unified-diff viewer with optional inline GitHub comments.
   Public surface: the DiffViewer component + the DiffCommentApi contract. */
export { DiffViewer } from "./DiffViewer";
export type { DiffCommentApi } from "./comments";
```

Note what it does *not* export: `CodeLine`, `CommentCard`, `helpers`, `styles`.
That is the point — the barrel defines a boundary, it does not aggregate a folder.

### BAD — `export *` aggregation

```ts
// lib/hooks/index.ts
export * from "./core";
export * from "./agents";
export * from "./reviews";
export * from "./trace";
export * from "./repo-intel";
```

Importing `usePulls` from `@/lib/hooks` pulls in every hook module, plus their
transitive imports. `export *` also hides name collisions and defeats
tree-shaking.

### Better

```ts
import { usePulls } from "@/lib/hooks/core";
import { usePrReviews } from "@/lib/hooks/reviews";
```

A barrel here is defensible only as a stable public API with explicit named
re-exports — never `export *`.

---

## 5. Constants

### BAD

```ts
// lib/constants.ts — a global bag
export const SKELETON_ROWS = 8;
export const OPEN_STATUSES = new Set([...]);
export const API_TIMEOUT = 30_000;
export const MAX_DIFF_LINES = 2000;
```

Unrelated modules now share one import and one reason to change.

### GOOD — placed by reach

```ts
// used once, in one file
const SKELETON_ROWS = 8;

// PullsListView/constants.ts — used across the view's components
export const COLUMN_KEYS = [...] as const;
export const OPEN_STATUSES = new Set(["needs_review", "reviewed", "stale"]);

// lib/config.ts — environment, read once, validated once
export const config = {
  apiBase: requireEnv("NEXT_PUBLIC_API_BASE"),
  requestTimeoutMs: 30_000,
} as const;
```

---

## 6. Business logic out of the component

### BAD

```tsx
export function PullsListView() {
  const { data: pulls } = usePulls(repoId);

  const visible = pulls
    ?.filter((p) => status === "all" || (status === "open"
      ? OPEN_STATUSES.has(p.reviewStatus)
      : p.state === status))
    .sort((a, b) => sort === "updated"
      ? Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
      : b.number - a.number);
  // …
}
```

### GOOD

```ts
// helpers.ts — no React, directly unit-testable
export function filterPulls(pulls: Pull[], status: StatusFilter): Pull[] { … }
export function sortPulls(pulls: Pull[], sort: SortKey): Pull[] { … }
```

```tsx
const visible = sortPulls(filterPulls(pulls ?? [], status), sort);
```

Note this stays a derived value computed during render — no `useState`, no
`useEffect`, per [react-best-practices](../react-best-practices/SKILL.md).

---

## 7. The `"use client"` boundary

### BAD — boundary at the root

```tsx
// app/repos/[repoId]/pulls/page.tsx
"use client";
```

Everything the route imports and renders joins the client bundle.

### GOOD — boundary at the interactive leaf

```tsx
// page.tsx — Server Component
import { PullsListView } from "./_components/PullsListView";
export default function PullsPage() {
  return <PullsListView />;
}
```

```tsx
// _components/PullsListView/PullsListView.tsx
"use client";
```

### The children escape hatch

Server Components passed as `children` are **not** in the client module graph —
they render on the server and arrive as output:

```tsx
// _components/TraceDrawer.tsx
"use client";
export function TraceDrawer({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return open ? <aside>{children}</aside> : null;
}
```

```tsx
// page.tsx — still a Server Component
<TraceDrawer>
  <TraceSummary runId={id} />   {/* stays on the server */}
</TraceDrawer>
```

### Providers as deep as possible

```tsx
// GOOD
<html>
  <body>
    <ThemeProvider>{children}</ThemeProvider>
  </body>
</html>
```

Not `<ThemeProvider>` wrapping `<html>`.

---

## 8. Server-side data access

Applies when a route reads data on the server rather than through
`lib/hooks/*`.

```ts
// data/pulls.ts
import "server-only";                    // build error if imported client-side

export async function getPullDTO(repoId: string, number: number) {
  const user = await getCurrentUser();   // authorization inside the DAL
  const pull = await db.pull.findFirst({ where: { repoId, number } });
  if (!canSeeRepo(user, pull.repoId)) throw new Error("Forbidden");

  return {                               // minimal DTO, not the DB row
    id: pull.id,
    number: pull.number,
    title: pull.title,
    reviewStatus: pull.reviewStatus,
  };
}
```

```ts
// app/actions.ts — thin, and re-checks auth
"use server";
import { deletePull } from "@/data/pulls";

export async function deletePullAction(id: string) {
  await deletePull(id);          // auth + authz happen inside the DAL
  revalidatePath("/repos");
}
```

A page-level auth check does **not** cover Server Actions defined in that page —
each action is a separately reachable POST endpoint.

---

## 9. Promote on the second consumer

```
1st use   → inside the component's folder
2nd use, same route    → that route's _components/
2nd use, another route → src/components/ or src/lib/
```

`RepoNotFound` earned `src/components/repo-not-found/` because both the pulls
list and the PR detail route render it. A helper used by one view stays in that
view's `helpers.ts` — moving it up "in case someone needs it" is the cost, not
the saving.
