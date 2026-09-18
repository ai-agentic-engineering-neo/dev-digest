# Component conventions

The folder-per-component rule and where each kind of component lives.
Referenced from `client/CLAUDE.md`.

## The folder

Every component is a folder, never a bare `.tsx`. The full shape:

```
<Name>/
  <Name>.tsx        the component — the only file that returns JSX
  <Name>.test.tsx   vitest + jsdom, colocated
  styles.ts         `export const s = { … } satisfies CSSProperties`
  constants.ts      every literal (colours, labels, limits)
  helpers.ts        pure transforms, independently testable (`helpers.test.ts`)
  index.ts          the public surface — the only path other files import
```

Only `<Name>.tsx` and `index.ts` are mandatory; the rest appear when there is
something to put in them. `repo-not-found/` is two files, `diff-viewer/` is a
dozen — both are correct.

`index.ts` re-exports what the outside may use, nothing more:

```ts
export { SeverityCounts, default } from "./SeverityCounts";
export { SEVERITIES, severityCounts, sortBySeverity } from "./helpers";
export type { CountedSeverity, SeverityCountMap } from "./helpers";
```

## Naming

The file is PascalCase and matches the component name exactly. The **folder's
case depends on where it lives**:

| Location | Folder case | Example |
|---|---|---|
| `src/components/` (shared) | kebab-case | `src/components/severity-counts/SeverityCounts.tsx` |
| `app/**/_components/` (feature) | PascalCase | `app/agents/_components/AgentCard/AgentCard.tsx` |

Both are current and intentional — match the neighbours of the folder you are
adding to, do not "normalise" the other side.

## Where a component goes

- **Used by one route → colocate.** `app/<route>/_components/<Name>/`. The `_`
  prefix keeps it out of Next.js routing and marks it private to that route.
- **Used by two or more routes → share.** `src/components/<kebab-name>/`.
- **Used only inside one component → nest.** A component folder may hold its own
  `_components/`: `AgentsListView/_components/CreateAgentModal/`.
- **Generic input, chart or icon → do not write one.** It is already in the
  vendored design kit `src/vendor/ui` (`@devdigest/ui`): `kit/` for form controls
  and overlays, `charts/` for `Sparkline`, `Donut`, `MetricCard`. That folder is
  vendored — read it, do not edit it.

Promoting a colocated component to shared means moving the folder *and* renaming
it to kebab-case.

## Styling and text

- Styles are colocated in `styles.ts` as one exported `s` object of
  `CSSProperties`. No CSS modules, no styling library. Colours come from CSS
  variables (`var(--text-secondary)`), so both themes keep working.
- User-facing strings never live in a component. They go through `next-intl`:
  `const t = useTranslations("agents")` against
  `messages/<locale>/<namespace>.json`. A new namespace file is camelCase
  (`prReview.json`), and so are its keys.

## Tests

The test sits in the folder next to its subject: `<Name>.test.tsx` for rendered
behaviour, `helpers.test.ts` for the pure functions. Everything runs under vitest
+ jsdom with `fetch` mocked — no API, no browser. Real browser journeys belong in
`../e2e`.
