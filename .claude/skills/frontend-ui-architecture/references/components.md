# Components — splitting and composition

Source IDs resolve in `../README.md` → "Sources".

## When to split

- A component should do one thing; build the hierarchy from the data model and the mockup.
  Extract a part when it becomes complex — e.g. a table header becomes its own component once
  it gets sorting [S01].
- Strong signals to extract: the part has its own state, its own data hook, its own name in
  the design, its own test, or appears twice.
- Weak signals (not enough alone): line count, number of props. No authoritative source sets
  numeric limits; treat ~200 lines / ~7 props as "look again", not a rule.
- Several small related components in one file are fine (`SeverityCounters.tsx` next to
  `FindingsPanel.tsx`, `atoms.tsx`) [S02]. "One component per file" is a convention, not a React
  rule — do not add `react/no-multi-comp` [S41, S54].

## Hard rules

- **Never declare a component inside another component** — new identity every render, state
  resets, focus is lost [S02].
- Render must be pure: same props/state → same JSX; no mutation of pre-existing objects during
  render [S03].
- Event logic in handlers. `useEffect` only to sync with an external system (DOM API,
  EventSource, timers) — not to derive state, not to react to a prop change, not to chain
  updates [S07].
- Reset state on identity change with `key`, not with an effect [S07].

## Container / presentational is retired

Abramov's 2015 split is superseded by his own 2019 note (via S75; original S65) and patterns.dev
[S71]. Do not create `*Container.tsx` files. Current shape:

```
useFindingsFilter()        hook: state + data + memo-free derivation glue
helpers.ts                 pure: filterFindings(), groupBySeverity()
FindingsPanel.tsx          renders; calls the hook; forwards events
```

When the *same behaviour* needs *different looks*, use a headless hook/component (behaviour in
`useX`, markup by the caller) [S61]. For standard widgets prefer what `vendor/ui` already has.

## Composition before configuration

Order of tools [S04, S05]:
1. Plain props.
2. `children` / slot props (`header`, `actions`) — a "hole" the caller fills.
3. Extract a component when a prop is only passed through an intermediate that doesn't use it.
4. Context — for genuinely cross-cutting values (theme, active repo, toast), one context per
   concern.

"Move state down" and "lift content up" make data flow clearer first; any speed-up is a bonus
[S64].

Smells:
- A boolean prop that switches to a different subtree (`isCompact`, `showAdvanced`) → split into
  two components or pass the part as `children` [S74 secondary; S46].
- Two booleans that can't both be true (`isLoading` + `isError`) → one `status` union [S06].
- `{...props}` spread through app components → missing composition [S04].
- A component that keeps growing conditionals for each new caller → wrong abstraction; let
  callers compose [S46].

## Loading / error / empty

Use early returns with a shared layout, not nested ternaries [S46]:

```tsx
if (isLoading) return <Skeleton />;
if (isError) return <ErrorState onRetry={refetch} />;
if (!data.length) return <EmptyState … />;
return <List items={data} />;
```

## Compound components

Multi-part widgets share state through context; the part's hook throws if rendered outside the
parent [S44]. Avoid the `cloneElement` variant — it breaks as soon as a part is wrapped [S72].
For element polymorphism follow Radix `asChild`: the custom component must spread props and
pass `ref` through (React 19: `ref` is a normal prop, no `forwardRef` needed) [S27].

## Text and i18n in components

- No literal UI strings — key in `messages/en/<namespace>.json` + next-intl.
- Route components call `useTranslations("<namespace>")` for their own namespace.
- Shared components (`components/**`) take already-translated strings as props; the caller owns
  the namespace. Reason: component tests wrap only their own namespace, so a shared component
  that calls `useTranslations("common")` breaks every consumer's test (client/INSIGHTS.md,
  RunCostBadge `tokensLabel`).

## Styles placement

Inline style objects live in `<Name>/styles.ts` as `export const s = { … }` with
`CSSProperties` (`satisfies CSSProperties` for static entries, functions for dynamic ones).
When one side of a border/padding differs, write all four longhands — mixing a shorthand with a
side override triggers React's rerender warning (client/INSIGHTS.md, FindingCard).
