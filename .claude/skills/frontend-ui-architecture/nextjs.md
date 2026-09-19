# Next.js App Router — architecture rules

Complements `next-best-practices` (file conventions, RSC serialization, data APIs). This file covers only **where code goes** and **where the boundaries sit**.

## Route folders

- `app/` is for routing. Colocating files is already safe there, because only `page`/`route` files are publicly reachable. Use `_private` folders (`_components/`, `_lib/`) to keep UI and helpers visibly apart from routing files and safe from future Next.js file names.
- Route-only code goes in that route's `_components/` or `_lib/` (or files next to `page.tsx`). Code shared across routes goes in `src/components`, `src/lib`, `src/hooks`.
- `page.tsx` and `layout.tsx` stay **thin**: they read params and search params, fetch or prefetch, and compose feature components. They hold no business rules or big JSX trees.
- Use route groups `(name)` only for layout or section splits. Two groups must not resolve to the same URL, and switching root layouts triggers a full reload.
- A layout and a page are different consumers. Code both use (a query hook, a context) belongs at the nearest common segment or in shared `lib/`, not under the page's `_components/`.

## Server / Client boundary

- Default to Server Components. Put `'use client'` on the **smallest interactive leaf** (a search box, a tab bar, a form), not on a page or layout.
- `'use client'` marks a module-graph boundary: everything that file imports becomes client code. Keep server-only imports out of client files.
- To put server-rendered content inside a client shell (modal, tabs), pass it as `children` or props instead of converting it to a client component.
- Providers (TanStack Query, theme, i18n) are small client components in `lib/providers.tsx` (or similar), rendered as deep as practical.
- Wrap a third-party client-only library in a one-line `'use client'` adapter file.
- Put `import 'server-only'` at the top of any module that reads secrets or non-`NEXT_PUBLIC_` env vars. Use `client-only` for modules that touch `window`.
- Props that cross into a client component should be minimal (the fields it renders), not a whole domain object "just in case".

## Data layer

Pick **one** model per app and don't mix them:

| Model | When | Shape |
|---|---|---|
| **HTTP API client** (zero trust) | Next.js calls a separate backend (Fastify, Rails, …). | A typed API client module is the single path to data. The contract schema parses at the boundary. Per resource: fetcher, key factory and hooks in one module. Server Components may `fetch`/prefetch the same fetchers and hydrate the client cache (`HydrationBoundary`), reusing the same `queryOptions`. |
| **Data Access Layer (DAL)** | Next.js owns the DB. | `data/*.ts` marked `server-only`. It does authorization per call and returns DTOs (only safe fields). Only the DAL reads secret env vars. |
| Component-level fetch | Prototype only | Avoid in real code, because it leaks fields easily. |

- Server Actions go in `actions.ts` (colocated or per domain) with `'use server'`. Keep them **thin**: validate input, call the DAL or service, return a narrow result (`{ ok: true }`). Every action re-checks auth, because a page guard doesn't protect it.
- TanStack Query hooks are client-only, while the fetchers and `queryOptions` they use are isomorphic. One resource module can hold both, as long as it has no `'use client'` or `server-only` directive. Server Components import only its fetchers and `queryOptions`. Split out the hooks only when the module needs a directive.
- Don't copy query data into `useState`. The one exception is seeding a form once.

## State homes

| State | Home |
|---|---|
| Server data | Query cache (TanStack Query) or RSC props |
| Shareable, bookmarkable (filters, tab, page) | URL search params. If a URL-driven tab switches between parts of one form, keep the form mounted and hide the inactive part, because unmounting loses edits. |
| Ephemeral UI (open, hover, draft) | `useState`, colocated; lift only to the nearest common parent |
| Form | Form state seeded from server data, not synced back live |

## Config and i18n

- `.env*`, `next.config.*`, `tsconfig.json` and `public/` stay at the repo root even with `src/`. Read env through one parsed module.
- With next-intl, messages go in `messages/`, one file per namespace if that is the project's convention, and the request config in `src/i18n/`. A sub-feature's strings go into its feature's existing namespace. Add a new namespace only for a new feature area, never a global catch-all.
