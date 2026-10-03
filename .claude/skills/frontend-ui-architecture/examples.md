# frontend-ui-architecture — examples

Good/bad pairs keyed to [SKILL.md](SKILL.md) sections, using real paths from
`client/` so they pattern-match against the actual tree. "Bad" examples are
illustrative counter-patterns, not necessarily code that ever existed here.

## §1 Placement — route-local vs. promoted to shared

**Bad** — pre-extracting to shared before a second caller exists:

```
src/components/findings-popover/FindingsPopover.tsx   ← created speculatively,
                                                          only PRRow/FindingsCell uses it
```

**Good** — what actually happened in this repo. The popover started
route-local, inline in the PR list's cell component:

```
src/app/repos/[repoId]/pulls/_components/PRRow/FindingsCell.tsx
  → renders its own hover popover inline
```

Only once the PR detail page's `RunHistory.tsx` timeline needed the exact
same popover (a second, *unrelated* route) did it get promoted — note the
casing flip, `PascalCase` → `kebab-case`:

```
src/components/findings-popover/
├── FindingsPopover.tsx
├── FindingsPopover.test.tsx
├── helpers.ts        # computeFlip, findClipBoundary
├── helpers.test.ts
└── index.ts
```

Both call sites now import the shared version:

```ts
// src/app/repos/[repoId]/pulls/_components/PRRow/FindingsCell.tsx
import { FindingsPopover } from "@/components/findings-popover";

// src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx
import { FindingsPopover } from "@/components/findings-popover";
```

## §2 Folder anatomy — the full six-file shape vs. an inline-styled lone file

**Good** — `AgentCard/` uses all six files because it has a real constant
(model→colour map) and a real lookup function worth naming:

```
src/app/agents/_components/AgentCard/
├── AgentCard.tsx        # component only — no inline style objects
├── AgentCard.test.tsx
├── constants.ts         # MODEL_COLOR
├── helpers.ts           # modelColor(model)
├── styles.ts            # s.card(), s.headerRow, s.modelChip(color), …
└── index.ts
```

```ts
// AgentCard/helpers.ts
import { MODEL_COLOR } from "./constants";

export function modelColor(model: string): string {
  return MODEL_COLOR[model] ?? "var(--text-secondary)";
}
```

**Bad** — the same component with everything inlined would look like:

```tsx
// AgentCard.tsx (hypothetical, do not write this)
const MODEL_COLOR: Record<string, string> = { "gpt-4.1": "#3b82f6", /* … */ };
function modelColor(model: string) { return MODEL_COLOR[model] ?? "var(--text-secondary)"; }

export function AgentCard({ ag }: { ag: Agent }) {
  return (
    <div style={{ padding: 12, borderRadius: 8, background: "var(--bg-elevated)", /* … 15 more inline lines … */ }}>
      {/* … */}
    </div>
  );
}
```

Every style/constant/helper decision gets re-litigated inline instead of
being nameable and testable on its own — and the component body balloons
past the point where the actual JSX is easy to find.

Not every folder needs all six, either —
`src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/` is only:

```
RunHistory/
├── RunHistory.tsx        # 267 lines — no separate constants/helpers/styles
└── RunHistory.test.tsx
```

because its style/constant surface is genuinely small enough to stay inline;
that's a legitimate choice, not a folder that "forgot" its siblings.

## §3 Splitting — a real decomposition vs. a wrapper that buys nothing

**Good** — `RunTraceDrawer/` decomposes into a nested `_components/` because
it has six genuinely distinct concerns (trace body, tool-call rows, two
kinds of modal content, two collapsible sections):

```
RunTraceDrawer/
├── RunTraceDrawer.tsx        # 107 lines — orchestrates the drawer shell
├── RunTraceDrawer.test.tsx
├── constants.ts
├── helpers.ts
├── styles.ts
├── index.ts
└── _components/
    ├── atoms.tsx              # Stat, Row — trivial, never tested alone
    ├── FindingsSection/
    ├── PromptBlock/
    ├── PromptModalBody/
    ├── ToolCallRow/
    └── TraceBody/
        └── TraceBody.tsx      # 113 lines
```

Each nested piece owns one concern and none of them is a pass-through — e.g.
`TraceBody` renders the Stats grid and imports `formatRunCost` directly (no
badge slot in a plain `label/val` tile), while `_components/atoms.tsx`'s
`Stat`/`Row` are the two layout primitives every section reuses:

```tsx
// RunTraceDrawer/_components/atoms.tsx
export function Stat({ label, val }: { label: string; val: React.ReactNode }) {
  return (
    <div style={s.stat}>
      <div style={s.statLabel}>{label}</div>
      <div className="tnum" style={s.statVal}>{val}</div>
    </div>
  );
}
```

**Bad** — a wrapper split that only adds indirection (hypothetical):

```tsx
// TraceBodyContainer.tsx — buys nothing
export function TraceBodyContainer(props: TraceBodyProps) {
  return <TraceBody {...props} />;
}
```

No new loading/error surface, no distinct data dependency, no fragment a
sibling needs — just a name on the call stack. If you find yourself writing
this shape, that's the "split on line count, not on a problem" anti-pattern
from SKILL.md §3 — inline it back into `TraceBody` instead.

## §4 Business logic — hook layer vs. calling the API from a component

**Bad** — a component reaching past the hook layer:

```tsx
// hypothetical — do not do this
function AgentCard({ agentId }: { agentId: string }) {
  const [agent, setAgent] = useState<Agent | null>(null);
  useEffect(() => {
    fetch(`${API_BASE}/agents/${agentId}`).then((r) => r.json()).then(setAgent);
  }, [agentId]);
  // …
}
```

**Good** — the actual four-layer path:

```ts
// src/lib/api.ts — the only fetch()
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> { /* … */ }

// src/lib/hooks/agents.ts — the only caller of api.*
export function useAgent(id: string | null | undefined) {
  return useQuery({
    queryKey: ["agent", id],
    queryFn: () => api.get<Agent>(`/agents/${id}`),
    enabled: !!id,
  });
}
```

```tsx
// view component — calls the hook, branches on state
const { data: agent, isLoading } = useAgent(agentId);
if (isLoading) return <Skeleton />;
return <AgentCard ag={agent} />;   // presentational: props in, JSX out
```

**Mutation without invalidation** (bad — cache goes stale) **vs. with**
(good — the actual `useDeleteRun`):

```ts
// bad
useMutation({ mutationFn: (runId: string) => api.del(`/runs/${runId}`) });

// good — src/lib/hooks/reviews.ts
export function useDeleteRun(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => api.del<{ ok: boolean }>(`/runs/${runId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pr-runs", prId] });
      qc.invalidateQueries({ queryKey: ["reviews", prId] }); // deleting a run also deletes its review
    },
  });
}
```

**Query key missing a variable its `queryFn` reads** (bad — stale-cache
risk) **vs. complete**:

```ts
// bad — closes over prId but the key doesn't include it
useQuery({ queryKey: ["reviews"], queryFn: () => api.get(`/pulls/${prId}/reviews`) });

// good — src/lib/hooks/reviews.ts
useQuery({
  queryKey: ["reviews", prId],
  queryFn: () => api.get<ReviewRecord[]>(`/pulls/${prId}/reviews`),
  enabled: !!prId,
});
```

## §5 Constants — inline magic strings vs. colocated vs. route-level

**Bad:**

```tsx
<span style={{ color: status === "needs_review" ? "var(--warn)" : "var(--ok)" }}>
```

**Good — component-local** (`AgentCard/constants.ts`):

```ts
export const MODEL_COLOR: Record<string, string> = {
  "gpt-4.1": "#3b82f6",
  "gpt-4o": "#10b981",
  o1: "#f59e0b",
};
```

**Good — route-level**, shared by every `_components/` under one route
(`src/app/repos/[repoId]/pulls/constants.ts`):

```ts
export const STATUS_META: Record<string, { c: string; labelKey: string }> = {
  needs_review: { c: "var(--warn)", labelKey: "needs_review" },
  reviewed: { c: "var(--ok)", labelKey: "reviewed" },
  /* … */
};
export const COLUMN_KEYS: string[] = ["pullRequest", "author", "size", /* … */];

export type PrSize = "S" | "M" | "L";   // as const-style union, not enum
```

**`enum` vs. `as const`:**

```ts
// bad
enum PrSize { Small, Medium, Large }

// good — matches pulls/constants.ts
export type PrSize = "S" | "M" | "L";
```

## §6 Helpers — inline IIFE vs. `helpers.ts` vs. promotion to `src/lib/`

**Bad:**

```tsx
<span>{(() => { const c = counts.CRITICAL + counts.WARNING + counts.SUGGESTION; return c === 0 ? "—" : c; })()}</span>
```

**Good — colocated:**

```ts
// src/app/repos/.../FindingCard/helpers.ts
export function lineLabel(f: Finding): string { /* single-line vs range */ }
```

**Good — promoted**, once a second, unrelated folder needed the same
positioning math (`src/components/findings-popover/helpers.ts`):

```ts
export function computeFlip(trigger: TriggerRect, boundary: Boundary, naturalHeight: number) { /* … */ }
export function findClipBoundary(fromEl: HTMLElement): Boundary { /* … */ }
```

Both are concern-named (`findings.ts`, `github-urls.ts`, `model-label.ts` are
the other promoted `src/lib/` modules) — never a catch-all `utils.ts`.

## §7 Types — hand-written interface vs. `@devdigest/shared`

**Bad:**

```ts
// hypothetical, do not hand-duplicate the server's shape
interface Pull {
  id: string;
  number: number;
  title: string;
  author: string;
  // … now silently drifts from the server's actual PrMeta
}
```

**Good:**

```ts
// src/lib/types.ts
export type { PrMeta, PrDetail, PrFile /* … */ } from "@devdigest/shared";

// UI-only view model — not a server shape, so it's fine to define locally
export interface PrRowView {
  number: number;
  title: string;
  size: "S" | "M" | "L";
  sizeLines: string;
  findings: { CRITICAL: number; WARNING: number; SUGGESTION: number };
}
```

Import as `@devdigest/shared`, not `@/vendor/shared` — both resolve, only
the former is the convention (one existing file, `pulls/constants.ts:1`,
uses the raw path; don't copy that).

## §8 Barrels — deep import vs. folder import

**Bad** — the repo's one known violation, don't copy it:

```ts
// FindingsTab.tsx
import { RunHistory } from "../RunHistory/RunHistory";
```

**Good:**

```ts
// PRRow/index.ts
export { PRRow } from "./PRRow";

// any consumer
import { PRRow } from "../PRRow";
```
