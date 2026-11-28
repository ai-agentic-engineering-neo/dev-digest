# Examples

Illustrative: names follow dev-digest, but fields are simplified (e.g. `dismissed`) — check the real contracts before copying.

## 1. Growing a feature: colocate → split → promote

**Step 1 — one component, everything inline (fine while small):**
```
pulls/[number]/_components/FindingsPanel/
  FindingsPanel.tsx   // 120 lines
  index.ts
  styles.ts
```

**Step 2 — it grew: extract logic, then named UI pieces:**
```
FindingsPanel/
  FindingsPanel.tsx          // composition only
  helpers.ts                 // countBySeverity, filterFindings, sortFindings
  helpers.test.ts
  constants.ts               // SEVERITY_ORDER, DEFAULT_FILTER
  useFindingsFilter.ts       // filter state + keyboard focus
  _components/
    SeverityCounters/
    FindingsList/
```

**Step 3 — the diff page also needs `SeverityCounters` → promote it:**
```
src/components/severity-counters/SeverityCounters/…   // moved, imports updated
```
Not before step 3: one use is not reuse.

## 2. Business logic out of JSX

Bad — rule hidden in markup, untestable without rendering:
```tsx
export function FindingCard({ finding, run }: Props) {
  return (
    <div style={s.card}>
      {finding.severity === "CRITICAL" && !finding.dismissed && run.status === "done" && (
        <Badge>Blocks merge</Badge>
      )}
    </div>
  );
}
```

Good — named pure rule beside the component:
```ts
// FindingCard/helpers.ts
import type { Finding, RunSummary } from "@devdigest/shared";

export function isBlocking(finding: Finding, run: RunSummary): boolean {
  return finding.severity === "CRITICAL" && !finding.dismissed && run.status === "done";
}
```
```tsx
// FindingCard/FindingCard.tsx
{isBlocking(finding, run) && <Badge>{t("blocksMerge")}</Badge>}
```

## 3. Data access through the data layer

Bad:
```tsx
const [runs, setRuns] = useState<RunSummary[]>([]);
useEffect(() => { fetch(`/api/pulls/${prId}/runs`).then(r => r.json()).then(setRuns); }, [prId]);
```

Good:
```ts
// lib/hooks/reviews.ts
export const reviewKeys = {
  all: ["reviews"] as const,
  runs: (prId: string) => [...reviewKeys.all, "runs", prId] as const,
};

export function usePrRuns(prId: string | null | undefined) {
  return useQuery({
    queryKey: reviewKeys.runs(prId ?? ""),
    queryFn: () => api.get<RunSummary[]>(`/pulls/${prId}/runs`),
    enabled: !!prId,
  });
}
```
```tsx
// component
const { data: runs = [] } = usePrRuns(prId);
```

## 4. Constants

Bad:
```ts
refetchInterval: 4000,
if (findings.length > 50) …
const tabs = ["overview", "findings", "diff"];
type Tab = "overview" | "findings" | "diff";   // duplicated
```

Good:
```ts
// constants.ts
export const POLL_INTERVAL_MS = 4000;
export const MAX_VISIBLE_FINDINGS = 50;
export const TABS = ["overview", "findings", "diff"] as const;
export type Tab = (typeof TABS)[number];
```

## 5. Helpers vs utils

```
lib/utils.ts            ✗  formatDate, isBlocking, buildGithubUrl, sleep, SEVERITY_COLORS …
lib/github-urls.ts      ✓  generic within one concept, used app-wide
lib/format-cost.ts      ✓  used by PR list, runs timeline, trace stats
FindingCard/helpers.ts  ✓  isBlocking — only FindingCard cares
```

## 6. Thin route

```tsx
// app/repos/[repoId]/pulls/[number]/page.tsx
export default async function Page({ params }: { params: Promise<{ repoId: string; number: string }> }) {
  const { repoId, number } = await params;
  return <PrDetailView repoId={repoId} number={Number(number)} />;
}
```

## 7. Boundaries lint (sketch)

```js
// eslint: import/no-restricted-paths
{
  zones: [
    { target: "./src/lib", from: "./src/app" },          // shared must not import routes/features
    { target: "./src/components", from: "./src/app" },
  ],
}
```
