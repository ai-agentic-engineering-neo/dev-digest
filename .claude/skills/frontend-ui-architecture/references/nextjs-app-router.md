# Next.js App Router — architecture layer

Scope: how the App Router shapes code organization. File-convention details (`loading.tsx`,
`error.tsx`, metadata, route handlers) are in `next-best-practices`.

Contents: [app/ is routing](#app-is-routing-and-composition) · [Colocation](#colocation-and-private-folders) ·
[Route groups](#route-groups) · [Server/client boundary](#serverclient-boundary) ·
[Server-only code](#server-only-code) · [DevDigest specifics](#devdigest-specifics)

## `app/` is routing and composition

- A segment becomes a URL only when it has `page.tsx` or `route.ts`; everything else in `app/`
  is safe to colocate.
- `page.tsx` / `layout.tsx` are **thin**: read params/search params, call data hooks or data
  functions, compose components, handle top-level states. Domain logic and large markup live
  in `_components/` and helpers.
- Shared, route-agnostic code stays outside `app/` (`src/components`, `src/lib`).

```
src/
  app/
    repos/[repoId]/pulls/
      page.tsx            # thin: params → hooks → compose
      constants.ts        # route-local
      helpers.ts
      styles.ts
      _components/
        PRRow/
        FilterBar/
      [number]/
        page.tsx
        _components/FindingCard/
  components/             # shared UI used by ≥ 2 routes
  lib/                    # api, hooks, contexts, integrations, app-wide helpers
```

## Colocation and private folders

- Prefix route-private folders with `_` (`_components`, `_lib`): excluded from routing and
  visibly "internal to this route".
- Code in `app/a/_components` may be used by `app/a/**` (child segments) but **not** by
  sibling routes. Promote to `src/components` when another route needs it.

## Route groups

- `(group)` folders organise routes or share a layout without adding a URL segment, e.g.
  `(dashboard)/repos`, `(dashboard)/agents` sharing an app shell; `(auth)/login` with a bare
  layout.
- Use them for layout boundaries, not as a replacement for feature folders.

## Server/client boundary

- Components are Server Components by default; `'use client'` marks the **entry** of a client
  subtree — every module it imports becomes client code.
- Put the directive as low as possible: on the interactive leaf (`LikeButton`), not on the page
  or layout.
- To render server content inside a client component, pass it as `children` / a prop from a
  server parent; don't import a Server Component into a client file.
- Props across the boundary must be serializable (no functions, class instances).
- Third-party components that use hooks but lack `'use client'`: wrap them once in your own
  client component in `src/components/` or `src/lib/`.
- Context providers are client components; mount them as deep as possible and pass the rest of
  the tree as `children` (`src/lib/providers.tsx`).

## Server-only code

When the app has server code of its own (DB, secrets, server actions):
- Start such modules with `import 'server-only'` so a client import fails the build.
- Centralise data access in a Data Access Layer: runs only on the server, does authorization,
  returns minimal DTOs. Only the DAL imports DB clients and reads secrets.
- Server actions colocate with their feature/route (`actions.ts`) and stay thin:
  validate input → call a service/DAL function → revalidate. Business rules live in the service.
- Use route handlers (`app/api/**/route.ts`) for webhooks and external callers, not as an
  internal API for your own pages.

## DevDigest specifics

- The client talks to a separate Fastify API (`NEXT_PUBLIC_API_BASE`); it has no DB, secrets,
  server actions or DAL. Data flows `src/lib/api.ts` → `src/lib/hooks/*` → components.
- Most pages are client components (React Query, `useParams`). Keep new pages consistent, but
  still push `'use client'` down for new purely presentational trees where possible.
- Don't add Next.js route handlers as a proxy to the API unless a spec asks for it.
