# Examples — bad → good (DevDigest client)

Shapes modelled on the current `client/src` (names are real, snippets are simplified — not
verbatim copies). Source IDs resolve in `README.md`.

## 1. Data fetching inside a component

```tsx
// ✘ RunHistory.tsx
const [runs, setRuns] = useState<RunSummary[]>([]);
useEffect(() => { api.get<RunSummary[]>(`/pulls/${prId}/runs`).then(setRuns); }, [prId]);
```

```tsx
// ✔ RunHistory.tsx
const { data: runs = [] } = usePrRuns(prId);   // from @/lib/hooks/reviews
```

Why: data only through `lib/hooks` (client/CLAUDE.md); server data is a cache, not state [S47].

## 2. Inline query key → `queryOptions` factory (new code)

```ts
// ✘ key typed in three places (hook, two invalidations) — drift waits to happen
useQuery({ queryKey: ["pr-runs", prId], queryFn: () => api.get(`/pulls/${prId}/runs`) });
qc.invalidateQueries({ queryKey: ["pr-runs", prId] });
```

```ts
// ✔ lib/hooks/reviews.ts
export const prRunsOptions = (prId: string) =>
  queryOptions({ queryKey: ["pr-runs", prId], queryFn: () => api.get<RunSummary[]>(`/pulls/${prId}/runs`) });
// hook: useQuery({ ...prRunsOptions(id), enabled: !!prId })
// invalidate: qc.invalidateQueries({ queryKey: prRunsOptions(prId).queryKey })
```

Why: key and fn travel together; one source for hooks, invalidation, prefetch [S49, S50].

## 3. Business rule in JSX → pure helper

```tsx
// ✘ FindingsPanel.tsx
{findings
  .filter((f) => !hideLow || f.confidence >= 0.65)
  .filter((f) => severity === "ALL" || f.severity === severity)
  .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
  .map((f) => <FindingCard key={f.id} finding={f} />)}
```

```ts
// ✔ FindingsPanel/helpers.ts  (+ helpers.test.ts)
export function visibleFindings(findings: FindingRecord[], opts: { hideLow: boolean; severity: SeverityFilter }) {
  return findings
    .filter((f) => !opts.hideLow || f.confidence >= LOW_CONFIDENCE_THRESHOLD)
    .filter((f) => opts.severity === "ALL" || f.severity === opts.severity)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
```

Why: rules are plain TS, tested without rendering; the magic number becomes a named constant
[S60, S09].

## 4. Runtime import from the vendored contracts

```ts
// ✘ passes tsc + vitest, 500s the Next dev build
import { Severity } from "@devdigest/shared";
const LEVELS = Severity.options;
```

```ts
// ✔ FindingsPanel/constants.ts
import type { Severity } from "@devdigest/shared";
export const SEVERITY_LEVELS = ["CRITICAL", "WARNING", "SUGGESTION", "INFO"] as const satisfies readonly Severity[];
```

Why: client/INSIGHTS.md — the vendored barrel's `.js` re-exports can't be resolved by webpack.

## 5. Shared component owning a translation namespace

```tsx
// ✘ components/run-cost-badge/RunCostBadge.tsx
const t = useTranslations("common");
return <span>{t("tokens", { n })} · {cost}</span>;
```

```tsx
// ✔ caller translates, badge renders
<RunCostBadge costUsd={run.cost_usd} variant="inline" tokensLabel={t("runs.tokens", { n })} />
```

Why: a shared component's namespace breaks every consumer's test (client/INSIGHTS.md).

## 6. Component declared inside a component

```tsx
// ✘
function TraceBody({ calls }) {
  const Row = ({ call }) => <div>{call.name}</div>;   // new type every render → remount
  return calls.map((c) => <Row key={c.id} call={c} />);
}
```

```tsx
// ✔ _components/ToolCallRow/ToolCallRow.tsx  (or a sibling function at module scope)
export function ToolCallRow({ call }: { call: ToolCall }) { return <div>{call.name}</div>; }
```

Why: [S02].

## 7. Fat page → thin page

```tsx
// ✘ app/repos/[repoId]/pulls/[number]/page.tsx — 200+ lines, deep imports, all hooks
import { AppShell } from "../../../../../components/app-shell";
import { usePullDetail, usePulls } from "../../../../../lib/hooks";
```

```tsx
// ✔ page.tsx
import { PrDetailView } from "./_components/PrDetailView";
export default function PRDetailPage() { return <PrDetailView />; }
// PrDetailView.tsx ("use client"): params, hooks, tab state
import { AppShell } from "@/components/app-shell";
import { usePullDetail, usePulls } from "@/lib/hooks";
```

Why: page only composes (client/CLAUDE.md, `app/agents/page.tsx` already does this); `@/` alias
instead of relative chains.

## 8. Single-use component promoted too early

```
✘ src/components/verdict-banner/   ← only used by pulls/[number]
✔ src/app/repos/[repoId]/pulls/[number]/_components/VerdictBanner/
```

Why: promote on the second consumer, not before [S41, S55].

## 9. Boolean that picks a subtree → composition

```tsx
// ✘
<ReviewRunAccordion run={run} showTrace showCost compact />
```

```tsx
// ✔
<ReviewRunAccordion run={run} actions={<RunCostBadge costUsd={run.cost_usd} />}>
  <TraceSection runId={run.id} />
</ReviewRunAccordion>
```

Why: slots instead of flags; the accordion stops knowing about every caller [S04, S46].

## 10. Contradictory booleans → status union

```ts
// ✘ const [isSending, setIsSending] = useState(false); const [isSent, setIsSent] = useState(false);
// ✔ const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
```

Why: [S06].
