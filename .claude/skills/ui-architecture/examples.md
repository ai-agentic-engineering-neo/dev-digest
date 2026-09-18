# UI Architecture — Examples

Concrete before/after for each rule in [SKILL.md](SKILL.md).

---

## Colocate, then promote

```
# BAD: promoted on a guess, before a second consumer exists
src/lib/utils/formatPrReviewCost.ts   # only ReviewSummary.tsx calls this

# GOOD: colocated until a second feature actually needs it
app/reviews/_components/ReviewSummary/
  ReviewSummary.tsx
  helpers.ts        # formatPrReviewCost lives here, feature-scoped

# Later, once app/agents/_components/AgentCostBadge also needs the same formatting:
src/lib/utils/formatCost.ts   # promoted — now 2 real, unrelated consumers
```

---

## Component splitting: by responsibility, not line count

```tsx
// BAD: one component doing three jobs, held together with section comments
function PrReviewPanel({ pr }: Props) {
  // --- filters ---
  const [severity, setSeverity] = useState<Severity | null>(null);
  // ...20 lines of filter UI + logic

  // --- findings list ---
  const filtered = pr.findings.filter(f => !severity || f.severity === severity);
  // ...30 lines of list rendering

  // --- cost summary ---
  const totalCost = pr.batches.reduce((sum, b) => sum + b.cost_usd, 0);
  // ...15 lines of cost UI
}

// GOOD: each section is its own component, PrReviewPanel composes them
function PrReviewPanel({ pr }: Props) {
  return (
    <>
      <FindingsFilter value={severity} onChange={setSeverity} />
      <FindingsList findings={pr.findings} severity={severity} />
      <CostSummary batches={pr.batches} />
    </>
  );
}
```

---

## Container/presentational → hook + component

```tsx
// BAD: wrapper component whose only job is calling a hook
function PrListContainer() {
  const { data } = usePrList();
  return <PrList prs={data} />;
}

// GOOD: call the hook where it's needed, skip the wrapper
function PrListPage() {
  const { data } = usePrList();
  return <PrList prs={data} />;
}
```

---

## Constants vs. utils vs. helpers

```ts
// CONSTANT — feature-scoped, colocated
// app/reviews/_components/SeverityBadge/constants.ts
export const SEVERITY_COLORS = {
  critical: 'red',
  high: 'orange',
  medium: 'yellow',
} as const;

// CONSTANT — app-wide, promoted
// src/lib/constants.ts
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001';

// UTIL — generic, no feature knowledge, top-level once shared
// src/lib/utils/formatDate.ts
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

// HELPER — shapes data for ONE feature only, colocated, stays colocated
// app/reviews/_components/CostSummary/helpers.ts
export function sumBatchCost(batches: ReviewBatch[]): number {
  return batches.reduce((sum, b) => sum + b.cost_usd, 0);
}
```

The tell: `formatDate` would make sense in a completely unrelated project. `sumBatchCost`
only makes sense here, next to the one component that needs a PR's total review cost.

---

## Business logic layering

```tsx
// BAD: domain rule (a policy decision) inlined into a hook
function usePrReview(prId: string) {
  const { data } = useApiQuery(['pr', prId], () => fetchPr(prId));
  const isStale = data && Date.now() - new Date(data.updated_at).getTime() > 86_400_000;
  return { ...data, isStale };
}

// GOOD: the rule is a plain, testable function; the hook just calls it
// src/lib/reviewPolicy.ts
export function isReviewStale(updatedAt: string, now = Date.now()): boolean {
  return now - new Date(updatedAt).getTime() > 86_400_000;
}

// src/lib/hooks/usePrReview.ts
function usePrReview(prId: string) {
  const { data } = useApiQuery(['pr', prId], () => fetchPr(prId));
  return { ...data, isStale: data ? isReviewStale(data.updated_at) : false };
}
```

`isReviewStale` can now be unit-tested with a plain input/output — no React, no
network mock, no hook-testing setup.

---

## Barrel files: narrow vs. wide

```ts
// GOOD: narrow, one folder, defines this feature's public surface
// app/reviews/_components/CostSummary/index.ts
export { CostSummary } from './CostSummary';

// BAD: wide, app-level, re-exports unrelated modules — hurts tree-shaking,
// slows dev builds, invites circular imports
// src/components/index.ts
export * from './AppShell';
export * from './DiffViewer';
export * from './MermaidDiagram';
export * from './PageShell';
// (25 more...) — import directly from each file instead
```
