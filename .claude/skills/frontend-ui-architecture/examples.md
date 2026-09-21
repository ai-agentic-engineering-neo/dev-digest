# Frontend UI Architecture — Examples

Concrete before/after examples for each rule in [SKILL.md](SKILL.md).

---

## Technical-Layer Folders vs. Feature-Based Folders

```
// BAD: organized by technical type — every change touches 4+ folders
src/
├── components/
│   ├── LoginForm.tsx
│   ├── SignupForm.tsx
│   ├── InvoiceList.tsx
│   └── InvoiceDetail.tsx
├── hooks/
│   ├── useLogin.ts
│   ├── useSignup.ts
│   ├── useInvoices.ts
│   └── useInvoiceDetail.ts
├── utils/
│   ├── validatePassword.ts
│   ├── formatInvoiceTotal.ts
│   └── formatCurrency.ts
└── services/
    ├── authApi.ts
    └── invoiceApi.ts

// GOOD: organized by feature — everything for "billing" lives in one place
src/
├── features/
│   ├── auth/
│   │   ├── components/{LoginForm,SignupForm}.tsx
│   │   ├── hooks/{useLogin,useSignup}.ts
│   │   └── utils/validatePassword.ts
│   └── billing/
│       ├── components/{InvoiceList,InvoiceDetail}.tsx
│       ├── hooks/{useInvoices,useInvoiceDetail}.ts
│       ├── api/invoiceApi.ts
│       └── utils/formatInvoiceTotal.ts
├── components/       # only truly shared: Button, Modal, Spinner
├── hooks/            # only truly shared: useDebounce, useMediaQuery
└── utils/
    └── formatCurrency.ts   # generic enough for any feature to use
```

---

## Colocate First, Promote Later

```
// BAD: a helper used by exactly one component, pre-emptively "shared"
src/utils/formatInvoiceTotal.ts     // only ever imported by InvoiceDetail.tsx
src/features/billing/components/InvoiceDetail.tsx

// GOOD: colocated until a second consumer actually shows up
src/features/billing/utils/formatInvoiceTotal.ts
src/features/billing/components/InvoiceDetail.tsx

// Once `features/reports` also needs it, THEN promote:
src/utils/formatInvoiceTotal.ts   // now imported by billing AND reports
```

---

## Pure Business Logic vs. Application Logic (Hook)

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

---

## Constants vs. Utils

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

---

## Splitting an Overgrown Component

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

---

## Barrel Files: Public API vs. Habit

```ts
// BAD: a barrel re-exporting an entire feature's internals "just because"
// features/billing/index.ts
export * from './components/InvoiceList';
export * from './components/InvoiceDetail';
export * from './hooks/useInvoice';
export * from './hooks/useInvoiceFilters';
export * from './utils/calculateInvoiceTotals';
export * from './api/invoiceApi';
// every import anywhere in the app now pulls the whole feature's module graph

// GOOD: import directly from the file that defines it
import { useInvoice } from '@/features/billing/hooks/useInvoice';
import { InvoiceDetail } from '@/features/billing/components/InvoiceDetail';

// A barrel is still fine for a genuine, small public surface, e.g. a
// shared design-system package meant to be consumed from outside:
// components/ui/index.ts
export { Button } from './Button';
export { Modal } from './Modal';
```

---

## Next.js: Route-Local UI via Private Folders

```
// BAD: route-specific components scattered in a distant global folder
src/
├── app/dashboard/orders/page.tsx
└── components/
    ├── OrderStatusFilter.tsx   // only used by /dashboard/orders
    ├── OrderTable.tsx          // only used by /dashboard/orders
    └── OrderSummary.tsx        // only used by /dashboard/orders

// GOOD: colocated with the route using a private folder (the `_` prefix
// keeps Next.js from treating it as a route segment)
src/app/dashboard/orders/
├── page.tsx
└── _components/
    ├── OrderStatusFilter.tsx
    ├── OrderTable.tsx
    └── OrderSummary.tsx
```
