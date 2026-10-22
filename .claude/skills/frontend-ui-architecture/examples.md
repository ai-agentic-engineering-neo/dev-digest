# Examples — frontend UI architecture in DevDigest

Real paths from `client/src`, plus good/bad contrasts. Rules: [SKILL.md](SKILL.md).

## 1. Reference tree

```
client/src/
  app/
    repos/[repoId]/pulls/
      page.tsx                    # PR list — thin page: params → usePulls → compose
      constants.ts                # STATUS_META, SIZE_COLOR, COLUMN_KEYS (route-local)
      helpers.ts
      styles.ts
      _components/
        PRRow/{PRRow.tsx, index.ts, PRRow.test.tsx}
        FilterBar/{FilterBar.tsx, index.ts}
      [number]/
        page.tsx                  # PR detail
        _components/
          FindingCard/{FindingCard.tsx, index.ts, constants.ts, helpers.ts, styles.ts, FindingCard.test.tsx}
          VerdictBanner/ FindingsTab/ PrDetailHeader/ RunReviewDropdown/
  components/                     # shared by ≥ 2 routes, kebab-case folders
    severity-counts/{SeverityCounts.tsx, FindingsPopover.tsx, helpers.ts, index.ts, SeverityCounts.test.tsx}
    app-shell/ page-shell/ diff-viewer/ run-cost-badge/ repo-not-found/
  lib/
    api.ts                        # the only place that does HTTP
    hooks/{core,agents,reviews,trace,repo-intel}.ts + index.ts
    format-cost.ts, github-urls.ts, model-label.ts, feature-models.ts   # topic-named app-wide modules
    repo-context.tsx, providers.tsx, theme.tsx, toast.tsx
  vendor/shared  vendor/ui        # contracts and design system (packages)
```

## 2. "I need a new component"

**Task:** a `ConfidenceMeter` shown inside `FindingCard` only.

✅ `app/repos/[repoId]/pulls/[number]/_components/FindingCard/ConfidenceMeter.tsx`
(or `FindingCard/_components/ConfidenceMeter/` if it grows its own helpers).

❌ `src/components/confidence-meter/` — only one consumer; premature promotion.

**Later:** the agents page also needs it → move it to `src/components/confidence-meter/`
with an `index.ts`, update both imports in the same change.

## 3. Constants

✅ Component-local map (real code):

```ts
// FindingCard/constants.ts
export const SEV_COLOR: Record<string, string> = {
  CRITICAL: "var(--crit)", WARNING: "var(--warn)", SUGGESTION: "var(--sugg)", INFO: "var(--info)",
};
export const SEV_COLOR_FALLBACK = "var(--text-muted)";
```

❌ Hard-coded UI copy as a constant:

```ts
export const EMPTY_TITLE = "No findings yet";          // ✗ goes to messages/en/*.json
```

❌ Redefining a contract enum:

```ts
export type Severity = "CRITICAL" | "WARNING";          // ✗ import from @devdigest/shared
```

## 4. Helpers vs lib

✅ Route-specific pure function → colocated:

```ts
// FindingCard/helpers.ts
export function lineLabel(f: Pick<FindingRecord, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}
```

✅ App-wide, topic-named module: `src/lib/format-cost.ts` (+ `format-cost.test.ts`),
`src/lib/github-urls.ts`.

❌ `src/utils/index.ts` collecting `lineLabel`, `formatCost`, `githubBlobUrl`, `sleep`…

## 5. Business logic out of the component

❌ Before:

```tsx
"use client";
export function StaleBadge({ prId }: { prId: string }) {
  const [pr, setPr] = useState<PrMeta>();
  useEffect(() => { fetch(`http://localhost:3001/pulls/${prId}`).then(r => r.json()).then(setPr); }, [prId]);
  const stale = pr && Date.now() - Date.parse(pr.updated_at) > 7 * 86_400_000 && !pr.reviewed;
  return stale ? <Badge>stale</Badge> : null;
}
```

Problems: transport in the component, hard-coded URL, domain rule inline, hard-coded string.

✅ After:

```ts
// lib/api.ts          → api.pull(prId)                      (transport)
// lib/hooks/core.ts   → usePull(prId)                       (server state)
// pulls/helpers.ts
export const STALE_AFTER_MS = 7 * 86_400_000;
export function isStale(pr: PrMeta, now: number): boolean {  // domain rule, unit-tested
  return !pr.reviewed && now - Date.parse(pr.updated_at) > STALE_AFTER_MS;
}
```

```tsx
// StaleBadge.tsx
export function StaleBadge({ prId }: { prId: string }) {
  const t = useTranslations("prReview");
  const { data: pr } = usePull(prId);
  if (!pr || !isStale(pr, Date.now())) return null;
  return <Badge>{t("list.status.stale")}</Badge>;
}
```

(Names here are illustrative; check `src/lib/api.ts` and `src/lib/hooks/*` for existing calls first.)

## 6. Imports

❌ Real smell found in `FindingCard.tsx`:

```ts
import { githubBlobUrl } from "../../../../../../../lib/github-urls";
```

✅

```ts
import { githubBlobUrl } from "@/lib/github-urls";
```

❌ Reaching into another component's internals / another route:

```ts
import { countBySeverity } from "@/components/severity-counts/helpers";            // ✗ internals
import { PRRow } from "@/app/repos/[repoId]/pulls/_components/PRRow";              // ✗ cross-route
```

✅ Import the public entry; if another route needs `PRRow`, promote it to `src/components/`.

## 7. Server/client boundary (general Next.js)

❌ `'use client'` on a layout just because one button is interactive — the whole subtree ships
to the browser.

✅ Keep the layout a Server Component; mark only `<ThemeToggle>` with `'use client'`, and pass
server-rendered content into client wrappers via `children`:

```tsx
// layout.tsx (server)
<Modal>{/* client */}
  <Cart />{/* server, passed as children */}
</Modal>
```

## 8. Splitting a page

`pulls/page.tsx` keeps: params, `usePulls`, filter state from the URL, loading/empty/error
states, composition of `FilterBar` + `PRRow`. Row rendering, row helpers and the filter UI live
in `_components/` and `helpers.ts`. If the page grows a new region (e.g. a bulk-action toolbar
with its own state) → new `_components/BulkActions/`.
