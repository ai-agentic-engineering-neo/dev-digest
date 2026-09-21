# Folder Structure

Where a file lives at the project/feature level — the top-level layout, the
decision order for placing a new file, and the anti-patterns that show up
when this goes wrong. For component-internal organization (splitting a
component, business logic placement, constants/utils) see
[component-organization.md](component-organization.md). For Next.js App
Router specifics see [nextjs-organization.md](nextjs-organization.md).

## Core Principle: Colocation Over Categorization

Default to organizing by **feature/domain**, not by technical type. A folder
structure of `components/`, `hooks/`, `utils/`, `services/` at the project
root forces every change to touch multiple folders and tells a new developer
nothing about what the app does. A structure organized by feature (`auth/`,
`billing/`, `search/`) keeps everything that changes together in one place,
and the folder names describe the product, not the framework — this is
sometimes called "screaming architecture."

The underlying rule (Kent C. Dodds, paraphrasing Dan Abramov): **things that
change together should live together.** Before creating a new top-level
folder, ask "what changes together?" rather than "what type of file is
this?"

## Top-Level Structure

```
src/
├── app/            # routing shell, providers, root layout (Next.js: app/)
├── features/        # one folder per domain/feature — most of the code lives here
│   └── <feature>/
│       ├── components/   # components used only by this feature
│       ├── hooks/         # feature-specific hooks (state, data fetching)
│       ├── api/            # feature-specific API calls / query definitions
│       ├── utils/          # pure helpers used only by this feature
│       ├── constants/       # feature-specific constants (or a constants.ts file)
│       └── types.ts
├── components/       # SHARED, reusable, feature-agnostic UI only (Button, Card, Modal)
├── hooks/            # SHARED hooks used by 2+ features (useDebounce, useMediaQuery)
├── lib/              # third-party client setup (API client, query client, auth client)
├── utils/            # SHARED pure utility functions with no feature knowledge
├── constants/         # SHARED, app-wide constants (routes, config, breakpoints)
└── types/             # SHARED types used across features
```

**The boundary rule:** a feature may import from `components/`, `hooks/`,
`lib/`, `utils/`, `constants/` at the root — but the root-level shared
folders must never import from `features/`, and one feature should not
reach into another feature's internals. If two features need to share
something, promote it to the root-level shared folder; don't import
across features directly.

## Where Does a New File Go? (decision order)

1. **Used by exactly one component, in one place?** Colocate it in that
   component's file or folder. Don't create a shared file for a single
   consumer — that's a premature abstraction.
2. **Used only within one feature?** Put it in that feature's
   `components/`, `hooks/`, `utils/`, or `constants/` subfolder.
3. **Used by 2+ features, has no feature-specific knowledge?** Promote it
   to the root-level shared folder (`components/`, `hooks/`, `utils/`,
   `constants/`).
4. **A route's UI, layout, or data fetching, in Next.js App Router?** See
   [nextjs-organization.md](nextjs-organization.md) — colocate inside the
   route segment via a private folder rather than a distant global folder.

Files migrate outward as they gain consumers — don't pre-emptively put
everything in a shared folder "in case it's reused later." A helper used by
one component belongs next to that component until a second consumer
appears.

## Examples

### Technical-Layer Folders vs. Feature-Based Folders

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

### Colocate First, Promote Later

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

### Barrel Files: Public API vs. Habit

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

## Anti-Patterns to Flag

- **Barrel files as a default habit** (`index.ts` that only re-exports
  everything in a folder) — they look tidy but hurt tree-shaking, slow
  down dev servers and `tsc`, and are a common source of circular
  imports. Reserve a barrel for a folder's genuine public API surface,
  not every directory.
- **Deep cross-feature imports** — `features/billing` reaching into
  `features/auth/hooks/useInternalThing`. If billing needs something from
  auth, that something belongs in the shared layer, or auth should expose
  it through a narrow, intentional export.
- **Premature global folders** — creating `components/`, `hooks/`, or
  `constants/` entries for something used exactly once "because that's
  where they go." Colocate first; promote to shared only on a second
  consumer.

## Applied in This Repo (dev-digest)

`client/` (`@devdigest/web`) already implements the principles above with
its own naming twist — apply the rules through these concrete conventions
here rather than the generic folder names shown earlier:

- **Shared/reusable components** → `client/src/components/<kebab-case-name>/`
  (e.g. [client/src/components/diff-viewer](../../../client/src/components/diff-viewer)).
  Note the naming flips from PascalCase (route-local, see
  [nextjs-organization.md](nextjs-organization.md)) to kebab-case here —
  that's the repo's own signal for "this promoted from a feature into the
  shared layer," so don't rename a component's case without also moving it.
- Before adding a new shared file, check
  [client/AGENTS.md](../../../client/AGENTS.md) (`client/CLAUDE.md` points
  here) — it is the authoritative source for this package's naming and
  should win over this skill's generic folder names whenever they conflict.

## Checklist (for reviews)

1. Does the folder structure describe the product's domains, or does it
   describe React/Next.js technical categories at the top level?
2. Is anything in a shared folder (`components/`, `utils/`, `hooks/`,
   `constants/`) actually used by only one feature? → demote/colocate it.
3. Is there a barrel file whose only job is re-exporting a folder,
   outside of a genuine public-API boundary? → consider removing it.
4. Does any feature import directly from another feature's internal
   folders instead of a shared layer? → flag the boundary violation.
