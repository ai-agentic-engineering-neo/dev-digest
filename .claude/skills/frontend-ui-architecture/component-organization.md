# Component Organization

How to split a growing component, where business logic belongs (pure
function vs. hook), and the constants/utils/helpers naming convention. For
top-level project layout and where a new file goes, see
[folder-structure.md](folder-structure.md). For Next.js App Router
specifics see [nextjs-organization.md](nextjs-organization.md).

## Component Splitting

- A component earns a split when it mixes more than one concern (data
  fetching + layout + a complex interaction), not just when it gets long.
  Line count is a symptom, not the rule.
- Prefer extracting a **child component** when a chunk of JSX has its own
  clear responsibility and could be named on its own (`SearchResults`,
  `FilterPanel`) — not when you're just trying to shorten a function.
  React's own guidance: component boundaries should map onto your data
  model, the same way you'd decide whether something deserves its own
  function.
- Prefer extracting a **hook** when what you're pulling out is behavior
  (state, an effect, a subscription, data fetching) rather than markup.
  If it doesn't return JSX, it's a hook or a plain function, not a
  component.
- The container/presentational split still matters conceptually even
  though hooks replaced the class-based version of the pattern: something
  should decide *what* data to show (a hook), and something should decide
  *how* to render it (a component that receives props and stays free of
  data-fetching concerns).

### Example: Splitting an Overgrown Component

```tsx
// BAD: one component doing data fetching, filtering logic, and three
// distinct pieces of UI
function Dashboard() {
  const { data } = useQuery(['orders'], fetchOrders);
  const [status, setStatus] = useState('all');
  const filtered = data?.filter((o) => status === 'all' || o.status === status);

  return (
    <div>
      <div className="filters">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All</option>
          <option value="pending">Pending</option>
        </select>
      </div>
      <table>
        {filtered?.map((o) => (
          <tr key={o.id}><td>{o.id}</td><td>{o.total}</td></tr>
        ))}
      </table>
      <div className="summary">
        Total: {filtered?.reduce((sum, o) => sum + o.total, 0)}
      </div>
    </div>
  );
}

// GOOD: each concern extracted where the responsibility naturally maps —
// filtering state → hook, each UI block → its own named component
function useOrderFilter(orders: Order[] | undefined) {
  const [status, setStatus] = useState('all');
  const filtered = orders?.filter((o) => status === 'all' || o.status === status);
  return { status, setStatus, filtered };
}

function Dashboard() {
  const { data } = useQuery(['orders'], fetchOrders);
  const { status, setStatus, filtered } = useOrderFilter(data);

  return (
    <div>
      <OrderStatusFilter value={status} onChange={setStatus} />
      <OrderTable orders={filtered} />
      <OrderSummary orders={filtered} />
    </div>
  );
}
```

## Where Business Logic Lives

Two different things get called "business logic," and they belong in
different places:

- **Pure business logic** — validation, calculations, data
  transformation/formatting, deciding "what should happen" from given
  inputs. Write these as **plain functions** with no React dependency:
  they take arguments, return a result, and can be unit-tested without
  rendering anything. Place them in the feature's `utils/` (or a
  `services/`/`domain/` file if the feature is large enough to want the
  distinction).
- **Application/UI logic** — orchestrating state, calling the pure
  business logic, wiring up data fetching, reacting to user interaction.
  This belongs in a **custom hook**, because only a hook can hold React
  state or reach into context. A hook should call the pure functions
  from `utils/`, not reimplement the logic inline.

Rule of thumb: if the logic needs `useState`, `useEffect`, `useContext`, or
any other hook, it has to live in a hook. If it's a pure calculation or
transformation with no such dependency, pull it out into a plain function
— that instantly makes it testable and reusable outside of React (e.g.
also from a server action or a Node script).

Never write business logic directly inside a component body beyond
calling a hook and rendering the result — a component that both computes
and renders is doing two jobs.

### Example: Pure Business Logic vs. Application Logic (Hook)

```ts
// BAD: business logic (pure calculation) and application logic (state,
// side effects) tangled together inside the component
function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    invoiceApi.get(invoiceId).then((data) => {
      // business logic buried inside a component + effect
      const subtotal = data.lineItems.reduce((sum, li) => sum + li.qty * li.price, 0);
      const tax = subtotal * data.taxRate;
      const total = subtotal + tax - data.discount;
      setInvoice({ ...data, subtotal, tax, total });
      setLoading(false);
    });
  }, [invoiceId]);

  if (loading) return <Loader />;
  return <InvoiceSummary invoice={invoice} />;
}

// GOOD: pure calculation extracted to a testable function...
// features/billing/utils/calculateInvoiceTotals.ts
export function calculateInvoiceTotals(invoice: RawInvoice) {
  const subtotal = invoice.lineItems.reduce((sum, li) => sum + li.qty * li.price, 0);
  const tax = subtotal * invoice.taxRate;
  const total = subtotal + tax - invoice.discount;
  return { subtotal, tax, total };
}

// ...application logic (fetching, state) lives in a hook that calls it...
// features/billing/hooks/useInvoice.ts
export function useInvoice(invoiceId: string) {
  const { data, isLoading } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => invoiceApi.get(invoiceId),
  });
  const invoice = data ? { ...data, ...calculateInvoiceTotals(data) } : null;
  return { invoice, isLoading };
}

// ...and the component only renders.
function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const { invoice, isLoading } = useInvoice(invoiceId);
  if (isLoading) return <Loader />;
  return <InvoiceSummary invoice={invoice} />;
}
```

## Constants vs. Utils vs. Helpers

These three words get used loosely; pick one convention and apply it
consistently rather than agonizing over the label:

- **Constants** — fixed values that don't depend on runtime input: enum-like
  string unions, config values, breakpoints, route paths, feature flags,
  magic numbers pulled out of code. A constant is data, not behavior.
- **Utils** — small, pure, general-purpose functions with **no side
  effects** and no dependency on a specific feature's domain (formatters,
  validators, array/object helpers). If it could be copy-pasted into an
  unrelated project and still make sense, it's a util.
- **Helpers** (when a project distinguishes them from utils at all) —
  functions that assist one specific feature or one specific component,
  not general-purpose. Since the distinction is arbitrary across teams,
  this skill's recommendation is: don't create a separate `helpers/`
  folder — colocate feature-specific helpers inside that feature's
  `utils/`, and only keep a root-level `utils/` for genuinely
  feature-agnostic functions.

If a "utility" has a side effect (writes to storage, calls an API, mutates
something outside its arguments), it isn't a utility — treat it as
application logic and put it in a hook or service instead.

### Example: Constants vs. Utils

```ts
// BAD: magic values and a formatting function mixed into a components file
const TAX_RATE = 0.2;
function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}
function InvoiceRow({ item }: { item: LineItem }) {
  return <span>{formatMoney(item.price * TAX_RATE)}</span>;
}

// GOOD: constant and pure util each in their own place, imported where needed
// constants/tax.ts
export const DEFAULT_TAX_RATE = 0.2;

// utils/formatCurrency.ts
export function formatCurrency(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

// features/billing/components/InvoiceRow.tsx
import { DEFAULT_TAX_RATE } from '@/constants/tax';
import { formatCurrency } from '@/utils/formatCurrency';

function InvoiceRow({ item }: { item: LineItem }) {
  return <span>{formatCurrency(item.price * DEFAULT_TAX_RATE)}</span>;
}
```

## Anti-Patterns to Flag

- **A `utils/` or `helpers/` folder that becomes a junk drawer** — dozens
  of unrelated functions in one file. Split by concern
  (`utils/currency.ts`, `utils/validation.ts`) once a single file no
  longer describes what's in it.
- **Atomic Design's five-tier hierarchy (atoms/molecules/organisms/…) as
  the primary organizing scheme for product code** — it works for a
  standalone design system, but it does not map naturally to
  domain/business logic and tends to fragment a single feature across
  five unrelated folders. Prefer feature-based grouping (see
  [folder-structure.md](folder-structure.md)); reach for atomic tiers only
  inside a dedicated design-system package if you have one.

## Applied in This Repo (dev-digest)

`client/` (`@devdigest/web`) implements the principles above with its own
naming twist:

- **Application logic / data fetching hooks** → one file per *domain* in
  `client/src/lib/hooks/` (`agents.ts`, `reviews.ts`, `repo-intel.ts`, …),
  not one file per hook. This is a deliberate variant of this skill's
  "hooks hold state/orchestration" rule: domain-level hook files replace
  a `hooks/` folder full of single-hook files.
- **Pure utils + third-party client setup live together** in `client/src/lib/`
  (`format-cost.ts`, `github-urls.ts`, `severity.ts`, `model-label.ts`
  alongside `providers.tsx`, `theme.tsx`). dev-digest doesn't split a
  separate top-level `utils/` from `lib/` — both this skill's "shared pure
  utils" and "third-party client setup" categories are merged into `lib/`.
  The underlying rule still applies: keep files in `lib/` pure/config-only,
  and colocate anything feature-specific inside that feature's route
  `_components/` instead of adding it to `lib/` (see
  [nextjs-organization.md](nextjs-organization.md)).
- Before adding a new shared file, check
  [client/AGENTS.md](../../../client/AGENTS.md) (`client/CLAUDE.md` points
  here) — it is the authoritative source for this package's naming and
  should win over this skill's generic folder names whenever they conflict.

## Checklist (for reviews)

1. Does any pure calculation/validation/formatting live inside a
   component body or a `useEffect` instead of a plain function? → extract
   it.
2. Does a hook reimplement business logic inline instead of calling a
   pure function from `utils/`? → extract the pure part.
3. Is a `utils/`/`helpers/` folder turning into a junk drawer of unrelated
   functions? → split by concern.
4. Is Atomic Design's five-tier hierarchy being used to organize product
   code rather than an isolated design-system package? → prefer
   feature-based grouping instead.
