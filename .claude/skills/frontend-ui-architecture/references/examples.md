# Worked examples

Each example shows the smell, the target shape, and the rule from `SKILL.md`
that decides it.

## Contents

1. Logic buried in a component → four tiers
2. A "reusable" util with one consumer
3. Promoting a helper to shared
4. Two features that need each other
5. A god component → split by responsibility
6. `'use client'` on a layout
7. Constants junk drawer

## 1. Logic buried in a component → four tiers

**Before** — fetching, a business rule, formatting and view in one body:

```tsx
export function FindingsPanel({ prId }: { prId: string }) {
  const [data, setData] = useState<Finding[]>([]);
  useEffect(() => { fetch(`/api/pulls/${prId}/findings`).then(r => r.json()).then(setData); }, [prId]);
  const blocking = data.filter(f => f.severity === "critical" || (f.severity === "high" && !f.suppressed));
  return <ul>{blocking.map(f => <li key={f.id}>{f.title} — {f.file}:{f.line}</li>)}</ul>;
}
```

**After:**

```
FindingsPanel/
  FindingsPanel.tsx      # tier 4 — view
  helpers.ts             # tier 1 — isBlocking, lineLabel
features/reviews/api/
  queries.ts             # tier 2 — findingsQuery(prId) via lib/api
```

```ts
// helpers.ts — pure, testable without React
export const isBlocking = (f: Finding) =>
  f.severity === "critical" || (f.severity === "high" && !f.suppressed);
export const lineLabel = (f: Finding) => `${f.file}:${f.line}`;
```

```tsx
// FindingsPanel.tsx
export function FindingsPanel({ prId }: { prId: string }) {
  const { data = [] } = useQuery(findingsQuery(prId));
  const blocking = data.filter(isBlocking);        // derived, not stored
  return <ul>{blocking.map(f => <li key={f.id}>{f.title} — {lineLabel(f)}</li>)}</ul>;
}
```

Rules: section 4 (push logic to tier 1; no `fetch` in components; server state
stays in its cache). No tier-3 hook was created — `useQuery` plus one filter does
not justify one.

## 2. A "reusable" util with one consumer

**Smell:** `src/utils/formatFindingTitle.ts`, imported by one component, already
grown three optional parameters "for other screens".

**Fix:** move it back into the component's `helpers.ts`, drop the parameters
nobody passes. Principle 2 — duplication is cheaper than the wrong abstraction;
the remedy for a wrong one is to inline it and let the real shared shape emerge.

## 3. Promoting a helper to shared

`lineLabel` lives in `PR/_components/FindingCard/helpers.ts`. A second route (the
PR list hover card) now needs it.

1. Move it to the owning domain's shared module, e.g.
   `src/components/findings-preview/helpers.ts` or `src/features/reviews/helpers.ts`.
2. Update **every** import site, including the original component.
3. Delete it from the old file. Do not leave
   `export { lineLabel } from "…"` behind — a shim hides the new dependency, and
   Next.js dev builds have been seen to fail on exactly this shape.

## 4. Two features that need each other

**Smell:** `features/pulls/components/PRRow.tsx` imports
`features/reviews/components/SeverityChips`.

Options, in order of preference:

1. **Compose at the route.** The page renders `<PRRow chips={<SeverityChips … />} />`;
   neither feature knows the other exists.
2. **Promote.** If `SeverityChips` is domain-agnostic enough, move it to
   `src/components/`.
3. **Extract an entity.** If both features are really about the same data
   ("review findings"), that data and its display primitives are a lower layer
   both depend on (FSD's `entities`).

## 5. A god component → split by responsibility

`PullDetailPage.tsx` (600 lines) renders the header, tabs, a findings list with
filters, a run timeline and a trace drawer, and owns all their state.

- Name each responsibility: header, tab switcher, findings (+ filter state), run
  timeline, trace drawer (+ open/closed state, driven by `?trace=`).
- Each becomes `_components/<Name>/` with **its own state moved into it**. Only
  state two of them share — the selected tab — stays in the page view.
- The page view shrinks to layout + that shared state. The route `page.tsx` stays
  a two-liner.

Rule: section 5 — split by job and by who owns which state, not by line count.

## 6. `'use client'` on a layout

**Smell:** `app/(dashboard)/layout.tsx` starts with `'use client'` because the
sidebar has a collapse toggle. Every page under it is now client code.

**Fix:** layout stays a Server Component; the toggle becomes
`_components/SidebarToggle.tsx` with the directive. If the whole sidebar frame
needs client state, make `SidebarFrame` a client component that takes the nav
content as `children`.

## 7. Constants junk drawer

**Smell:** `src/constants.ts`, 400 lines, imported by 30 files: severity colors,
polling intervals, feature-flag names, API paths and UI copy.

**Fix, by kind:**

| Kind | New home |
|---|---|
| polling interval used by one hook | top of that hook's file |
| severity order and colors | `features/reviews/constants.ts` (or shared `constants/severity.ts` if 2+ features) |
| API paths | the API layer that calls them |
| env-derived flags | `src/config/`, read and validated once |
| UI copy | i18n catalog |

Move one kind at a time; delete the drawer when it is empty.
