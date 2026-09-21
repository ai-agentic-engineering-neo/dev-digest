# Accepted conventions — dashboard-ui

These conventions were already extracted and accepted for this repo. Each is
backed by a real file:line citation into `repo/`.

1. **styling** — Every component that accepts a `className` prop merges it
   with its own classes via `cn()` from `src/lib/cn.ts`, rather than only
   using hardcoded class names.
   Evidence: `src/components/Button.tsx:16`, `src/components/Card.tsx:15`.

2. **naming** — Internal event-handler functions are named `handleX` to
   match the `onX` prop they're wired to (e.g. `onClick` → `handleClick`).
   Evidence: `src/components/Button.tsx:11-13` (`handleClick` wired to `onClick`),
   `src/components/Card.tsx:10-12` (`handleExpand` wired to `onExpand`).

3. **data-fetching** — Components never call `fetch` directly; data fetching
   lives in a hook (`src/hooks/*`) and components receive data as props or
   hook return values.
   Evidence: `src/hooks/useOrders.ts:9` (`fetch('/api/orders')` inside a hook,
   not a component).

4. **types** — Component props are declared as a named `interface XProps`
   above the component, not as an inline object type in the function
   signature.
   Evidence: `src/components/Button.tsx:3-8` (`interface ButtonProps { ... }`),
   `src/components/Card.tsx:3-7` (`interface CardProps { ... }`).
