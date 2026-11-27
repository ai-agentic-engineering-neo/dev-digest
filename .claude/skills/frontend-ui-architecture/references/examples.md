# Examples — folder trees and refactors

## 1. A route with colocated feature code (DevDigest pattern)

```
src/app/agents/
  page.tsx                         # thin: renders <AgentsListView />
  _components/
    AgentsListView/
      AgentsListView.tsx
      index.ts
      constants.ts
      helpers.ts
      styles.ts
      _components/                 # parts used only by AgentsListView
        CreateAgentModal/
    AgentCard/
      AgentCard.tsx
      AgentCard.test.tsx
      index.ts
      constants.ts
      helpers.ts
      styles.ts
```

```tsx
// src/app/agents/page.tsx — good: routing only
import { AgentsListView } from "./_components/AgentsListView";

export default function AgentsPage() {
  return <AgentsListView />;
}
```

## 2. A shared component with a public API

```
src/components/diff-viewer/
  index.ts          # export { DiffViewer } ; export type { DiffCommentApi }
  DiffViewer/
  FileCard/
  CodeLine/
  comments.ts       # contract type for comment integration
  helpers.ts
  constants.ts
  styles.ts
```

```ts
// elsewhere — good
import { DiffViewer } from "@/components/diff-viewer";
// bad — reaches past the public API
import { FileCard } from "@/components/diff-viewer/FileCard/FileCard";
```

## 3. Bad → good: fetch and rules inside a component

```tsx
// BAD: view, data access and business rule mixed in one component
"use client";
export function RunsTable({ repoId }: { repoId: string }) {
  const [runs, setRuns] = useState<Run[]>([]);
  useEffect(() => {
    fetch(`/api/repos/${repoId}/runs`).then(r => r.json()).then(setRuns);
  }, [repoId]);
  const failed = runs.filter(r => r.status === "error" || (r.cost > 5 && !r.finished));
  return <Table rows={failed} />;
}
```

```ts
// GOOD: src/lib/hooks/runs.ts — data layer (only place that knows keys + endpoint)
export function useRuns(repoId: string) {
  return useQuery({
    queryKey: ["runs", repoId],
    queryFn: () => api.get<Run[]>(`/repos/${repoId}/runs`),
  });
}
```

```ts
// GOOD: RunsTable/helpers.ts — pure, testable rule
export const COST_ALERT_USD = 5;
export function isProblemRun(run: Run): boolean {
  return run.status === "error" || (run.cost > COST_ALERT_USD && !run.finished);
}
```

```tsx
// GOOD: RunsTable/RunsTable.tsx — view only; derived, not stored
export function RunsTable({ repoId }: { repoId: string }) {
  const { data: runs = [] } = useRuns(repoId);
  return <Table rows={runs.filter(isProblemRun)} />;
}
```

## 4. Promotion: a component becomes shared

1. `app/repos/[repoId]/_components/CostBadge/` is now also needed in `app/agents/`.
2. Move the folder to `src/components/cost-badge/`, keep `index.ts` exporting `CostBadge`.
3. Update both imports to `@/components/cost-badge`. Don't leave a re-export in the old place.
4. Its pure formatter, if used outside the badge too, moves to `src/lib/format-cost.ts` with a test.

## 5. Bad → good: `'use client'` too high (Server-rendered apps)

```tsx
// BAD: whole page becomes client code because one button needs state
"use client";
export default function Page() { /* static header, big list, one LikeButton */ }
```

```tsx
// GOOD: page stays a Server Component; only the island is client
export default async function Page() {
  const items = await getItems();          // server-only module
  return (<><Header /><List items={items} /><LikeButton /></>);
}
// LikeButton.tsx
"use client";
export function LikeButton() { const [liked, setLiked] = useState(false); /* … */ }
```

(DevDigest is a client-rendered studio, so its views are `'use client'` by design — this
example applies when a project renders on the server.)

## 6. Constants vs i18n vs derived values

```ts
// AgentCard/constants.ts — good
export const MAX_VISIBLE_TAGS = 3;
export const STATUS_TONE = { ok: "success", error: "danger" } as const;

// bad — user-visible text is not a constant; use messages/en/*.json + useTranslations()
export const EMPTY_TITLE = "No agents yet";

// bad — derived from data; compute in render or a helper
export const TOTAL_COST = agents.reduce(/* … */);
```
