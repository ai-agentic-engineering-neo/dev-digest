# Examples

Paths and names are from the real `client/`.

## Contents

1. Worked example: adding a feature to the PR page
2. Logic out of the page
3. Constants
4. Server data
5. Promotion
6. Imports

---

## 1. Worked example: adding a feature to the PR page

Task: *"Show a per-file findings summary on the PR detail page."*

1. **Owner?** Only `/repos/[repoId]/pulls/[number]` uses it, so it is route-local:
   `pulls/[number]/_components/FileFindingsSummary/`.
2. **Server data?** Findings already come from an existing hook. Reuse it. If a new endpoint were
   needed, add `useFileFindings` to `src/lib/hooks/reviews.ts` (plus the endpoint in `server/`).
3. **Rules?** "Group findings by file and sort files by worst severity" is pure, so it goes in
   `FileFindingsSummary/helpers.ts` as `groupByFile()` / `sortByWorstSeverity()`, with
   `helpers.test.ts`.
4. **Fixed values?** The max files shown goes in `constants.ts` as `MAX_FILES = 10`. The severity
   order already exists in `FindingsPanel/constants.ts`, so see §5 before copying it.
5. **Text?** Add `prReview.fileSummary.*` keys to `messages/en/prReview.json`.
6. **Split?** A list of rows means a `_components/FileRow/` child.
7. **Wire up:** `FindingsTab` renders `<FileFindingsSummary findings={…} />`; `page.tsx` is unchanged.

```
pulls/[number]/_components/FileFindingsSummary/
  FileFindingsSummary.tsx   index.ts   styles.ts   constants.ts
  helpers.ts   helpers.test.ts   FileFindingsSummary.test.tsx
  _components/FileRow/{FileRow.tsx,index.ts,styles.ts}
```

## 2. Logic out of the page

```tsx
// ❌ page.tsx holds the domain rules
export default function PullsPage() {
  const { data: pulls } = usePulls(repoId);
  const filtered = (pulls ?? [])
    .filter((p) => status === "all" || p.status === status)
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  …
}

// ✅ page composes; the rule is a named, tested pure function
// pulls/helpers.ts
export function visiblePulls<P extends { status: string; updated_at?: string | null }>(
  pulls: P[], status: string, sort: "newest" | "oldest",
): P[] { … }

// pulls/page.tsx
const shown = visiblePulls(pulls ?? [], status, sort);
```

## 3. Constants

```tsx
// ❌ new array on every render, magic number, literal text
function FindingsPanel() {
  const order = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };
  const hidden = findings.filter((f) => f.confidence < 0.65);
  return <p>Low confidence hidden</p>;
}

// ✅ FindingsPanel/constants.ts
export const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };
export const LOW_CONFIDENCE_THRESHOLD = 0.65;
// text → messages/en/prReview.json, read with useTranslations("prReview")
```

## 4. Server data

```tsx
// ❌ fetch in a component, then copying server data into local state
const [runs, setRuns] = useState<RunSummary[]>([]);
useEffect(() => { fetch(`${API}/pulls/${prId}/runs`).then(r => r.json()).then(setRuns); }, [prId]);

// ✅ src/lib/hooks/reviews.ts (real code, simplified)
export function usePrRuns(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-runs", prId],
    queryFn: () => api.get<RunSummary[]>(`/pulls/${prId}/runs`),
    enabled: !!prId,
  });
}
// component: read + derive, never copy
const { data: runs = [] } = usePrRuns(prId);
const latest = latestRun(runs); // helper
```

## 5. Promotion

`SEVERITY_ORDER` lives in `FindingsPanel/constants.ts`. A new component under the **same** route
needs it:

- one consumer → it stays where it is;
- second consumer in the same route → move it to the route level (`pulls/[number]/constants.ts`)
  or the common parent;
- a different route needs it too → move it to `src/lib/severity.ts` and update all imports.

Don't import `../FindingsPanel/constants` from a sibling. That reaches into another component's
internals.

## 6. Imports

```ts
// ❌
import { s } from "../FindingsPanel/styles";                     // another component's internals
import { Button } from "@devdigest/ui/primitives/Button";         // deep import into the design system
import { PRRow } from "@/app/repos/[repoId]/pulls/_components/PRRow"; // from src/components → app

// ✅
import { FindingsPanel } from "../FindingsPanel";                 // its index.ts
import { Button } from "@devdigest/ui";
import { RunCostBadge } from "@/components/run-cost-badge";
```
