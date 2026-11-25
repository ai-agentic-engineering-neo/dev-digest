# Examples — react-architecture

Good and bad patterns for [SKILL.md](SKILL.md). Source IDs → [references.md](references.md).

---

## 1. Folder trees by project size [W1, B1, F1]

**Small (one screen, a few components)**: don't over-structure.
```
src/
  App.tsx
  TodoList.tsx
  TodoItem.tsx
  helpers.ts
  constants.ts
```

**Medium (Next.js App Router, route-colocated)**: this is the DevDigest shape.
```
src/
  app/
    agents/
      page.tsx                       # thin: <AgentsListView />
      _components/
        AgentsListView/
          AgentsListView.tsx
          AgentsListView.test.tsx
          constants.ts               # TEMPLATES, grid cols
          helpers.ts                 # pure, React-free
          helpers.test.ts
          index.ts                   # export { AgentsListView } from "./AgentsListView"
          _components/
            CreateAgentModal/        # used only by AgentsListView
  components/                        # domain-agnostic, used by ≥2 routes
    diff-viewer/
  lib/
    api.ts                           # fetch wrappers
    hooks/reviews.ts                 # TanStack Query per domain
```

**Large (many teams)**: explicit feature modules with lint-enforced boundaries.
```
src/
  app/                 # routes + composition
  features/
    reviews/{api,components,hooks,helpers.ts,constants.ts,types.ts}
    agents/{...}
  components/ hooks/ lib/ utils/ config/ types/
```

❌ **Bad: grouped by technical type at the top level**
```
src/
  components/   (80 files from every feature)
  containers/
  hooks/        (useReviewFilter, useAgentForm, useTheme… all mixed)
  utils/        (formatSeverity, debounce, parseDiff…)
  constants.ts  (900 lines)
```
Every change touches four folders, and nothing says what the app does [P1, A1].

---

## 2. Extracting business logic out of a component [MF1, A1, T4]

❌ **Before: fetch, reshape, business rule and view all in one body**
```tsx
export function FindingsPanel({ runId }: { runId: string }) {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [blocking, setBlocking] = useState(0);

  useEffect(() => {
    fetch(`/api/runs/${runId}/findings`).then(r => r.json()).then((data: Finding[]) => {
      const sorted = [...data].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
      setFindings(sorted);
      setBlocking(sorted.filter(f => f.severity === "critical" || f.severity === "high").length); // synced derived state
    });
  }, [runId]);

  return (/* … */);
}
```

✅ **After: three layers**
```ts
// helpers.ts: pure, React-free, unit-tested
import { SEVERITY_RANK, BLOCKING_SEVERITIES } from "./constants";

export const sortBySeverity = (findings: Finding[]) =>
  [...findings].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);

export const countBlocking = (findings: Finding[]) =>
  findings.filter(f => BLOCKING_SEVERITIES.has(f.severity)).length;
```
```ts
// lib/hooks/reviews.ts: server state lives in the query layer
export function useRunFindings(runId: string) {
  return useQuery({ queryKey: ["runs", runId, "findings"], queryFn: () => api.getFindings(runId) });
}
```
```tsx
// FindingsPanel.tsx: view only; derived values computed during render
export function FindingsPanel({ runId }: { runId: string }) {
  const { data = [] } = useRunFindings(runId);
  const findings = sortBySeverity(data);
  const blocking = countBlocking(findings);
  return (/* … */);
}
```

---

## 3. Constants: scope like variables [K1, A1, W1]

```ts
// ✅ Module-level, outside the component. Drives markup. Types derived from it.
const TABS = ["overview", "files", "runs"] as const;
type Tab = (typeof TABS)[number];

export function PrDetail() {
  const [tab, setTab] = useState<Tab>("overview");
  return TABS.map(t => <TabButton key={t} active={t === tab} onClick={() => setTab(t)} />);
}
```
```tsx
// ❌ Recreated every render, magic values, user-facing copy as a constant
export function PrDetail() {
  const tabs = [{ id: 1, label: "Overview" }, { id: 2, label: "Files changed" }];
  if (findings.length > 25) { /* … */ }   // what is 25?
}
```
- User-facing labels → `messages/<locale>/` (i18n).
- `25` → `const MAX_INLINE_FINDINGS = 25` in the nearest `constants.ts`.

---

## 4. Helper vs util vs lib [J1, W1, B1]

```ts
// components/diff-viewer/helpers.ts: HELPER (knows domain types)
export const isOutdated = (c: ReviewComment, headSha: string) => c.commitSha !== headSha;

// utils/array.ts: UTIL (generic, copy-pasteable into any project)
export const groupBy = <T, K extends PropertyKey>(xs: T[], key: (x: T) => K) => /* … */;

// lib/api.ts: LIB (configured infrastructure / 3rd-party wrapper)
export const api = { getFindings: (runId: string) => request(`/runs/${runId}/findings`) };
```

---

## 5. Splitting a component by responsibility [A1, K2, R1]

❌ A 400-line `PrDetail` that renders the header, tabs, a filter input and the findings list. Typing in the filter re-renders everything.

✅
```tsx
export function PrDetail({ pr }: Props) {
  return (
    <>
      <PrDetailHeader pr={pr} />
      <Tabs>…</Tabs>
      <FindingsPanel runId={pr.latestRunId} />   {/* owns its own filter state */}
    </>
  );
}
```
The filter state moves *down* into `FindingsPanel`, so keystrokes re-render only that subtree [K2].

❌ **Over-splitting:** a `<GenericCard variant title subtitle icon iconPosition footer footerAlign …>` used once. Prefer composition:
```tsx
<Card>
  <Card.Header icon={<ShieldIcon />}>Security</Card.Header>
  <Card.Body>{children}</Card.Body>
</Card>
```
[K5, K6, PD1]

---

## 6. Dependency boundaries and lint enforcement [B1, E1, E2, T3]

```ts
// ❌ app/agents/_components/AgentCard/AgentCard.tsx
import { SeverityBadge } from "@/app/repos/[repoId]/pulls/[number]/_components/FindingCard/SeverityBadge"; // cross-route import

// ✅ promote it: it's now used by two routes and is domain-light
import { SeverityBadge } from "@/components/severity-badge/SeverityBadge";
```

`eslint.config.js` sketch (Bulletproof React recipe [B1, E2]):
```js
"import/no-restricted-paths": ["error", { zones: [
  // shared layer may not import features/routes
  { target: ["./src/components", "./src/lib", "./src/utils"], from: "./src/app" },
  // sibling route trees may not import each other
  { target: "./src/app/agents", from: "./src/app/repos" },
  { target: "./src/app/repos",  from: "./src/app/agents" },
]}],
"import/no-cycle": "error",
```

---

## 7. Barrel files [T3, AT1]

```ts
// ✅ Thin folder entry point: one component, one re-export
// FindingsPanel/index.ts
export { FindingsPanel } from "./FindingsPanel";

// ❌ Aggregate barrel in app code: importing one hook loads every domain module
// lib/hooks/index.ts
export * from "./core"; export * from "./agents"; export * from "./reviews"; /* … */

// ✅ New code imports the domain file directly
import { useRunFindings } from "@/lib/hooks/reviews";
```
