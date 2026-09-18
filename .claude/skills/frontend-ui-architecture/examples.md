# Examples

Before/after pairs for the rules in [SKILL.md](SKILL.md). Each one shows the
shape, not a complete file. React 19 + Next.js 15 App Router + TypeScript.

## 1. Split on branching, not on length

A component is not too big because it is long. It is too big when mutually
exclusive states are tangled together, because then you cannot read any one
state's markup without mentally executing the others.

**Before** — four states interleaved in nested ternaries:

```tsx
export function ReviewPanel({ query }: Props) {
  return (
    <section className="panel">
      <h2>Review</h2>
      {query.isPending ? (
        <Spinner />
      ) : query.isError ? (
        <ErrorNote error={query.error} />
      ) : query.data.findings.length === 0 ? (
        <Empty />
      ) : (
        <ul>{query.data.findings.map((f) => <Finding key={f.id} finding={f} />)}</ul>
      )}
    </section>
  );
}
```

**After** — one layout component, one early return per state. Nothing is
nested, and TypeScript narrows `query.data` to non-null after the guards:

```tsx
function Panel({ children }: { children: ReactNode }) {
  return (
    <section className="panel">
      <h2>Review</h2>
      {children}
    </section>
  );
}

export function ReviewPanel({ query }: Props) {
  if (query.isPending) return <Panel><Spinner /></Panel>;
  if (query.isError) return <Panel><ErrorNote error={query.error} /></Panel>;
  if (query.data.findings.length === 0) return <Panel><Empty /></Panel>;

  return (
    <Panel>
      <ul>{query.data.findings.map((f) => <Finding key={f.id} finding={f} />)}</ul>
    </Panel>
  );
}
```

The file did not get shorter. It got readable, which was the actual problem.

## 2. `"use client"` belongs on the leaf

**Before** — the directive sits on the page, so every component it renders,
including ones that never needed the browser, joins the client bundle:

```tsx
// app/reviews/page.tsx
"use client";

import { Header } from "./_components/Header";
import { FindingsTable } from "./_components/FindingsTable";
import { SearchBox } from "./_components/SearchBox";

export default function ReviewsPage() {
  const [q, setQ] = useState("");
  return (
    <>
      <Header />
      <SearchBox value={q} onChange={setQ} />
      <FindingsTable filter={q} />
    </>
  );
}
```

**After** — only the interactive island is a Client Component. The page stays
a Server Component and can fetch directly:

```tsx
// app/reviews/_components/SearchBox.tsx
"use client";

export function SearchBox({ onChange }: { onChange: (q: string) => void }) {
  const [q, setQ] = useState("");
  // …
}
```

```tsx
// app/reviews/page.tsx  — no directive
import { getFindings } from "@/data/findings";

export default async function ReviewsPage() {
  const findings = await getFindings();
  return (
    <>
      <Header />
      <SearchBox onChange={/* … */} />
      <FindingsTable findings={findings} />
    </>
  );
}
```

## 3. Pass a Server Component through a client shell

A Client Component that needs to *wrap* server-rendered content should take it
as `children`. The child is rendered on the server and handed over as output —
it never enters the client module graph, and nothing has to be serializable.

```tsx
// app/reviews/_components/Modal.tsx
"use client";

export function Modal({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return open ? <div role="dialog">{children}</div> : <button onClick={() => setOpen(true)}>Open</button>;
}
```

```tsx
// app/reviews/page.tsx — Server Component
export default async function Page() {
  return (
    <Modal>
      <FindingDetails id={id} />   {/* stays server-rendered */}
    </Modal>
  );
}
```

If instead you write `import { FindingDetails } from …` *inside* `Modal.tsx`,
it crosses the boundary and ships to the browser.

## 4. Not everything that shares logic is a hook

**Before** — a hook that calls no hooks. It cannot be called conditionally, it
cannot be used from a Server Component or an event handler, and it needs a
renderer to test:

```ts
export function useSortedFindings(findings: Finding[]) {
  return [...findings].sort(bySeverity);
}
```

**After** — a plain function, usable anywhere:

```ts
export function sortFindings(findings: Finding[]) {
  return [...findings].sort(bySeverity);
}
```

Keep the `use` prefix for logic that genuinely needs React — state, context or
subscriptions — and name it for the use case, not the mechanism:

```ts
export function useReviewStream(reviewId: string) { /* subscribes, cleans up */ }
```

## 5. Derived values are computed, not stored

**Before** — state plus an effect to keep it in sync. Renders twice, and goes
stale whenever someone forgets the dependency:

```tsx
const [findings, setFindings] = useState<Finding[]>([]);
const [errorCount, setErrorCount] = useState(0);

useEffect(() => {
  setErrorCount(findings.filter((f) => f.severity === "error").length);
}, [findings]);
```

**After** — computed during render, impossible to desynchronize:

```tsx
const [findings, setFindings] = useState<Finding[]>([]);
const errorCount = findings.filter((f) => f.severity === "error").length;
```

Reach for `useMemo` only when you have measured the computation and it is
actually expensive.

## 6. Thin Server Action, real logic in the DAL

**Before** — the action trusts the page that renders it, reads env directly,
and returns a raw row:

```ts
// app/reviews/[id]/page.tsx
export default async function Page({ params }) {
  const user = await getUser();
  if (!user) redirect("/login");           // protects the PAGE, not the action

  async function deleteReview(id: string) {
    "use server";
    return db.delete(reviews).where(eq(reviews.id, id));
  }
  // …
}
```

Anyone can POST to that action directly — it is a separate entry point, and the
page's redirect never runs.

**After** — the action verifies its own caller and delegates:

```ts
// data/reviews.ts
import "server-only";

export const verifySession = cache(async () => { /* … */ });

export async function deleteReview(id: string) {
  const session = await verifySession();
  if (!session) throw new Error("Unauthorized");

  const review = await db.query.reviews.findFirst({ where: eq(reviews.id, id) });
  if (review?.workspaceId !== session.workspaceId) throw new Error("Forbidden");

  await db.delete(reviews).where(eq(reviews.id, id));
}
```

```ts
// app/reviews/actions.ts
"use server";
import { deleteReview as remove } from "@/data/reviews";

export async function deleteReview(id: string) {
  await remove(id);          // authn + authz live in the DAL
  revalidatePath("/reviews");
}
```

The ownership check (`workspaceId`) is the part people skip. Without it, a valid
session can delete someone else's row.

## 7. Fetch from the source, not through your own HTTP layer

**Before** — a Server Component calling the app's own Route Handler. Real
network round trip, and it fails at build time because nothing is listening:

```tsx
export default async function Page() {
  const res = await fetch("https://localhost:3000/api/findings");
  const findings = await res.json();
  // …
}
```

**After**:

```tsx
import { getFindings } from "@/data/findings";

export default async function Page() {
  const findings = await getFindings();
  // …
}
```

Keep Route Handlers for what only they can do: webhooks, callback URLs,
third-party consumers, and data that genuinely must be fetched from the browser.

## 8. Do not source the same data twice

**Before** — the server renders one value and the client immediately fetches
another. React Query cannot revalidate a Server Component, so the count in the
heading and the list below it drift apart:

```tsx
// Server Component
const findings = await queryClient.fetchQuery(findingsQuery);
return <FindingsList initial={findings} count={findings.length} />;
```

```tsx
"use client";
function FindingsList({ initial }) {
  const { data } = useQuery({ ...findingsQuery, initialData: initial });
  // …
}
```

**After** — prefetch on the server, hydrate, and let the client own it from
there:

```tsx
// Server Component
const queryClient = new QueryClient();
void queryClient.prefetchQuery(findingsQuery);

return (
  <HydrationBoundary state={dehydrate(queryClient)}>
    <FindingsList />
  </HydrationBoundary>
);
```

```tsx
"use client";
function FindingsList() {
  const { data } = useSuspenseQuery(findingsQuery);
  // …
}
```

`findingsQuery` here is a `queryOptions()` factory rather than a custom hook,
precisely so it can be used on both sides:

```ts
export const findingsQuery = queryOptions({
  queryKey: ["findings", "list"],
  queryFn: fetchFindings,
});
```

## 9. Barrels: a curated surface, never `export *`

**Before** — everything leaks, including internals nobody should import, and
one import pulls in every module behind the barrel:

```ts
// components/severity-counts/index.ts
export * from "./SeverityCounts";
export * from "./helpers";
export * from "./constants";
export * from "./styles";
```

**After** — the index is the contract, and changing it is a visible diff:

```ts
export { SeverityCounts } from "./SeverityCounts";
export { severityCounts, sortBySeverity } from "./helpers";
export type { SeverityCountMap } from "./helpers";
```

Never route a third-party library through a barrel of your own — that is where
the cost is measured in hundreds of milliseconds, not opinions.

## 10. Promote on the second consumer, not the first guess

**Before** — a constant parked in a shared bucket with exactly one caller:

```ts
// src/constants/index.ts
export const MAX_DIFF_LINES = 4_000;     // used only by DiffViewer
```

**After** — colocated until something else needs it:

```ts
// app/reviews/_components/DiffViewer/constants.ts
export const MAX_DIFF_LINES = 4_000;
```

When a second feature genuinely needs it, move it to the shared config module
in that commit — not before. Environment-derived values are a different
category and belong in `config` from the start, read in one place.

## 11. Never define a component inside another component

**Before** — `Row` is a new function on every render, so React unmounts and
remounts it. Any state inside it, and any focus or scroll position, is lost on
each keystroke in the parent:

```tsx
function Table({ rows }: Props) {
  function Row({ row }: { row: RowData }) {
    const [expanded, setExpanded] = useState(false);
    return <tr onClick={() => setExpanded(!expanded)}>{/* … */}</tr>;
  }
  return <tbody>{rows.map((r) => <Row key={r.id} row={r} />)}</tbody>;
}
```

**After** — module level, data through props:

```tsx
function Row({ row }: { row: RowData }) {
  const [expanded, setExpanded] = useState(false);
  return <tr onClick={() => setExpanded(!expanded)}>{/* … */}</tr>;
}

function Table({ rows }: Props) {
  return <tbody>{rows.map((r) => <Row key={r.id} row={r} />)}</tbody>;
}
```

## 12. Composition before context

**Before** — context introduced to avoid passing one prop through two layers.
Every consumer now re-renders on every keystroke:

```tsx
const FilterContext = createContext<string>("");

function Page() {
  const [filter, setFilter] = useState("");
  return (
    <FilterContext value={filter}>
      <Layout><Sidebar /><Results /></Layout>
    </FilterContext>
  );
}
```

**After** — the middle layer takes `children` and never learns about the filter:

```tsx
function Page() {
  const [filter, setFilter] = useState("");
  return (
    <Layout
      sidebar={<Sidebar />}
      results={<Results filter={filter} />}
    />
  );
}
```

Keep context for cross-cutting concerns that most of the tree genuinely reads —
theme, current account, routing — not for skipping two levels of props.

## 13. Enforce the boundary you claim to have

A cross-feature import is the boundary violation that matters most, and it is
cheap to catch. The tier-1 tool:

```js
// eslint.config.js
{
  rules: {
    "import/no-restricted-paths": ["error", {
      zones: [
        {
          target: "./src/features/reviews",
          from: "./src/features",
          except: ["./reviews"],
          message: "Features may not import each other — compose them in app/, or move the shared part into src/.",
        },
        {
          target: "./src/components",
          from: "./src/features",
          message: "Shared code may not import from a feature.",
        },
      ],
    }],
  },
}
```

`from` is matched against the *resolved* path, so this keeps working when the
import is written through a path alias (`@/features/agents/...`).
