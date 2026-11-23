# Examples

Real DevDigest paths where possible. "After" shapes marked *(illustrative)* are proposals, not existing code. Source IDs resolve in [README.md](README.md).

Contents: [1. Constant scope](#1-where-does-this-constant-go) · [2. Helper vs hook](#2-helper-vs-hook) · [3. Thin page](#3-making-a-page-thin) · [4. New route](#4-adding-a-new-route) · [5. Premature abstraction](#5-premature-abstraction) · [6. Business logic out of JSX](#6-business-logic-out-of-jsx)

---

## 1. Where does this constant go?

`FindingsPanel/constants.ts` already holds `SEVERITY_ORDER`. `FindingCard` (a sibling) now needs the same order.

❌ Copy it into `FindingCard/constants.ts` (two sources of truth), or push it to `src/lib/constants.ts` (only two siblings of one route use it — that's over-promotion). [R1][R7]

✅ One level up, at the scope that covers both consumers:

```
pulls/[number]/
├── constants.ts                 ← SEVERITY_ORDER lives here now (route level)
├── page.tsx
└── _components/
    ├── FindingsPanel/{… constants.ts (SEVERITY_LEVELS, KEY_TO_ACTION, …)}
    └── FindingCard/{… imports from "../../constants"}
```
If a *different route* later needs it, it moves one more level, to `src/lib/` (or next to the shared contract). Promote one level per new consumer group.

---

## 2. Helper vs hook

```ts
// ✅ FindingsPanel/helpers.ts — pure: data in, data out, no React
export function countBySeverity(findings: Pick<FindingRecord, "severity">[]) { … }

// ✅ lib/hooks/reviews.ts — touches the cache/network, so it's a hook
export function usePrRuns(prId: string | null | undefined) {
  return useQuery({ queryKey: ["pr-runs", prId], queryFn: () => api.get(…), enabled: !!prId });
}
```
```ts
// ❌ named like a hook, calls none — forces Rules of Hooks on callers for nothing
export function useSeverityCounts(findings) { return countBySeverity(findings); }
// ✅ call the helper in render (wrap in useMemo only if measured — see react-best-practices)
```
`countBySeverity` is tested in `helpers.test.ts` with plain arrays; `usePrRuns` would need `renderHook` + a query client. Keeping them apart keeps tests cheap. [D3][R15]

---

## 3. Making a page thin

Today `pulls/[number]/page.tsx` (~185 lines) wires about nine data hooks, derives `allFindings`, and handles tab/drawer state in the page body.

❌ Add one more hook and one more derivation to the page.

✅ *(illustrative)* push orchestration into one hook, rendering into a view:
```
pulls/[number]/
├── page.tsx                      reads params → <PrDetailView prId=… />
└── _components/
    ├── PrDetailView/
    │   ├── PrDetailView.tsx      tabs + layout (markup + local UI state)
    │   ├── usePrDetail.ts        orchestration: PR, reviews, runs, cancel/delete, refetch
    │   ├── helpers.ts            pure: allFindings from reviews, tab resolution
    │   └── index.ts
    └── … existing children unchanged
```
```tsx
// page.tsx
export default function PRDetailPage() {
  const { repoId, number } = useParams<{ repoId: string; number: string }>();
  return <PrDetailView repoId={repoId} number={number} />;
}
```
Do this only when the task already touches the page. [M1][P1][R12]

---

## 4. Adding a new route

Request: "add `/repos/[repoId]/insights` with a chart and filters."

```
app/repos/[repoId]/insights/
├── page.tsx                      thin: params → <InsightsView />
├── constants.ts                  FILTER_KEYS, DEFAULT_RANGE (no sentences)
├── helpers.ts                    pure: bucketByDay(), applyFilters()  (+ helpers.test.ts)
├── styles.ts
└── _components/
    ├── InsightsView/{InsightsView.tsx, useInsights.ts, index.ts, InsightsView.test.tsx}
    ├── FilterBar/{FilterBar.tsx, index.ts, FilterBar.test.tsx}
    └── TrendChart/{TrendChart.tsx, index.ts, TrendChart.test.tsx}

lib/hooks/insights.ts             useInsights(repoId, filters) → api.get(…)  (+ export from lib/hooks/index.ts)
messages/en/insights.json         all labels/titles
```
Filters live in the **URL** (`?range=30d&agent=…`), data in the query cache, only transient UI (hover, open popover) in `useState`. Contract types for the response come from `@devdigest/shared` (diff both vendor copies if the server shape is new). No `fetch` in components. [D4][K2][N1]

---

## 5. Premature abstraction

Two cards look alike: `FindingCard` and `RunCard`.

❌ Immediately build `<GenericCard variant="finding|run" showFooter compact onAction renderBody … />`.

✅ Keep both. Extract only the part that is *the same concept* (e.g. a `SeverityIcon`) once it appears a second time. If a shared abstraction is later wrong, inline it back and re-extract — the cost of the wrong abstraction exceeds the cost of duplication. [R6][R7][R10]

---

## 6. Business logic out of JSX

❌
```tsx
<button onClick={async () => {
  if (f.confidence < 0.65 || f.severity === "INFO") return;   // rule buried in a handler
  await api.post(`/findings/${f.id}/accept`);
  qc.invalidateQueries({ queryKey: ["reviews", prId] });
  notify("Accepted");                                         // hard-coded string
}}>Accept</button>
```

✅
```ts
// helpers.ts — pure rule, unit-tested
export const canAccept = (f: Pick<FindingRecord, "confidence" | "severity">) =>
  f.confidence >= LOW_CONFIDENCE_THRESHOLD && f.severity !== "INFO";

// lib/hooks/reviews.ts — orchestration (mutation + invalidation + toast with an i18n'd message)
export function useFindingAction(prId: string) { … }
```
```tsx
<button disabled={!canAccept(f)} onClick={() => act({ id: f.id, kind: "accept" })}>
  {t("accept")}
</button>
```
The component binds data to markup; the rule is testable without rendering; the string is translatable. [M1][P1][D5]
