# Frontend Architecture — Examples

Directory-tree BAD/GOOD pairs for each rule in [SKILL.md](SKILL.md).

---

## Component Placement

```
// BAD: feature-specific component dumped in the global tree
src/components/
  RunTraceDrawer.tsx        // only ever used by one route

// GOOD: colocated with the route that owns it
src/app/repos/[repoId]/pulls/[number]/_components/
  RunTraceDrawer/
    RunTraceDrawer.tsx
    RunTraceDrawer.test.tsx
```

```
// BAD: promoted to shared/ because it "might" be reused elsewhere
src/components/
  agent-status-badge/       // used by exactly one page, "just in case"

// GOOD: stays local until a second, real consumer shows up
src/app/agents/_components/AgentCard/
  AgentStatusBadge.tsx
```

---

## Component Splitting

```
// BAD: one 400-line file mixing JSX, constants, and helpers
FindingCard.tsx             // component + SEVERITY_COLORS + formatDate() + tests

// GOOD: split by concern first, one axis at a time
FindingCard/
  FindingCard.tsx
  FindingCard.test.tsx
  constants.ts              // SEVERITY_COLORS
  helpers.ts                // formatDate()
  index.ts
```

```
// BAD: sub-components used only by one parent live at the same level
_components/
  RunTraceDrawer/
  TraceBody/                // only ever rendered inside RunTraceDrawer

// GOOD: nested under the parent that owns them
_components/
  RunTraceDrawer/
    RunTraceDrawer.tsx
    _components/
      TraceBody/
```

---

## Constants Placement

```
// BAD: a value used by every component under a route,
// duplicated into each component's own constants.ts
pulls/_components/PRRow/constants.ts        // export const PAGE_SIZE = 20
pulls/_components/PRFilters/constants.ts    // export const PAGE_SIZE = 20

// GOOD: promoted one level up, next to the route it serves
pulls/
  constants.ts               // export const PAGE_SIZE = 20
  _components/
    PRRow/
    PRFilters/
```

```
// BAD: extracting a constant used exactly once with an obvious meaning
const MAX_RETRIES_FOR_THE_SINGLE_UPLOAD_BUTTON = 3;

// GOOD: inline is clearer than a one-off name
retryUpload({ maxRetries: 3 });
```

---

## Utils, Helpers & Hooks

```
// BAD: business logic and pure formatting mixed into one "utils.ts"
lib/utils.ts
  export function fetchAgentRuns() { ... }      // I/O — belongs in a hook
  export function formatRelativeTime(d) { ... } // pure — fine here
  export function useDebounce(fn) { ... }        // stateful — belongs in hooks/

// GOOD: separated by what kind of logic it is
lib/hooks/agents.ts
  export function useAgentRuns() { ... }
lib/format.ts
  export function formatRelativeTime(d) { ... }
lib/hooks/useDebounce.ts
  export function useDebounce(fn) { ... }
```

```
// BAD: raw fetch inside a component
function RunList() {
  const [runs, setRuns] = useState([]);
  useEffect(() => { fetch('/api/runs').then(...).then(setRuns); }, []);
}

// GOOD: fetch lives behind a hook backed by the shared API client
function RunList() {
  const { data: runs } = useAgentRuns();
}
```

---

## Business Logic Placement

```
// BAD: the same "is run stale" rule duplicated in two components
// AgentCard.tsx
const isStale = Date.now() - run.updatedAt > STALE_MS;
// RunRow.tsx
const isStale = Date.now() - run.updatedAt > STALE_MS;

// GOOD: the rule lives once in lib/, imported by both
// lib/runs.ts
export function isRunStale(run: Run) {
  return Date.now() - run.updatedAt > STALE_MS;
}
```

---

## Feature Module Boundaries

```
// BAD: one feature reaches into another feature's internals
// agents/_components/AgentCard/AgentCard.tsx
import { PRRow } from '../../../repos/[repoId]/pulls/_components/PRRow/PRRow';

// GOOD: promote the shared piece instead of reaching across
src/components/pr-row-compact/PrRowCompact.tsx   // used by both features
```

---

## Next.js Route Architecture

```
// BAD: 'use client' on the whole page, even the static parts
// page.tsx
'use client';
export default function Page() {
  return <StaticHeader /* ... */ /><InteractiveFilterBar />;
}

// GOOD: directive pushed down to the leaf that actually needs it
// page.tsx (stays a Server Component)
export default function Page() {
  return <StaticHeader /><InteractiveFilterBar />;
}
// _components/InteractiveFilterBar/InteractiveFilterBar.tsx
'use client';
export function InteractiveFilterBar() { ... }
```

```
// BAD: route-specific components left un-prefixed, ambiguous in the tree
app/settings/[section]/
  ApiKeysPanel.tsx           // looks like it could be a route itself

// GOOD: explicit private folder signals "not a route"
app/settings/[section]/_components/
  SettingsApiKeys/
    SettingsApiKeys.tsx
```
