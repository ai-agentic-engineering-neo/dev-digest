# Next.js App Router — organization

How the principles in `SKILL.md` map onto the App Router. API behavior itself
(async params, caching, metadata) belongs to `next-best-practices`; this file only
answers *where things go*.

## Contents

1. Choosing a strategy
2. Private folders and route groups
3. A reference tree
4. Thin route files
5. Placing the client boundary
6. The server-side data layer
7. Server Actions
8. Client-rendered apps against a separate backend

## 1. Choosing a strategy

The official docs describe three strategies and recommend none over the others —
only consistency:

| Strategy | Shape | Fits |
|---|---|---|
| Project files outside `app` | `app/` routes only; everything else in `src/components`, `src/lib`, … | small apps; teams who want `app/` to read as a pure route map |
| Top-level folders inside `app` | `app/components`, `app/lib`, … | rarely the best choice: mixes routing and code in one tree |
| **Split by feature or route** | shared code in `src/`, route-specific code colocated in `_components/`, `_lib/` | **default** — colocation without losing a shared layer |

With "split by feature or route", the promotion path is:
`app/<route>/_components/X` → (second route needs it) → `src/features/<domain>/X`
or `src/components/X` (if domain-agnostic).

## 2. Private folders and route groups

- `_folder` — "a private implementation detail … opting the folder and all its
  subfolders out of routing". Colocation already works without the underscore
  (only `page`/`route` files are routable), but the prefix separates UI code from
  routing code at a glance and avoids clashes with future Next.js file names.
- `(group)` — organizes routes, or gives a subset of routes its own layout,
  without changing the URL: `(marketing)`, `(dashboard)`, `(auth)`.
- `src/` — keeps application code apart from root config files. Use it.

## 3. A reference tree

```
src/
  app/                              # routes only: thin files
    layout.tsx                      # html/body, providers
    (dashboard)/
      layout.tsx
      repos/[repoId]/pulls/
        page.tsx                    # params → <PullsView repoId=… />
        _components/                # used only by this route
          PullsView/
          PRRow/
    api/…/route.ts                  # only if the app owns endpoints
  features/                         # used by 2+ routes
    reviews/
      api/                          # fetchers, schemas, query keys/options
      components/
      hooks/
      helpers.ts
      constants.ts
      index.ts                      # the feature's public surface
  components/                       # domain-agnostic UI only
  hooks/                            # domain-agnostic hooks
  lib/                              # api client, query client, providers
  config/                           # env-derived config, validated once
  utils/                            # pure generic functions, by topic
  server/                           # server-only data access layer (if any)
```

## 4. Thin route files

A `page.tsx` does: read and validate `params` / `searchParams`, fetch or pass the
identifiers the view needs, pick the view, export `metadata`. It does not hold
filtering rules, formatting or event handlers.

```tsx
// app/repos/[repoId]/pulls/page.tsx
import { PullsView } from "./_components/PullsView/PullsView";

export default async function Page({ params }: { params: Promise<{ repoId: string }> }) {
  const { repoId } = await params;
  return <PullsView repoId={repoId} />;
}
```

`loading.tsx`, `error.tsx` and `not-found.tsx` are part of the route's surface:
put them beside `page.tsx` rather than hand-rolling the same states inside the view.

## 5. Placing the client boundary

The directive is a module-graph boundary, which makes it an architectural choice,
not a per-file annotation:

- "Code crosses through imports." Everything a `'use client'` file imports joins
  the client graph. So a directive on a layout drags the whole subtree into the
  browser.
- "Data crosses through props", which must be serializable — functions cannot
  cross (except Server Actions).
- Only the **entry** of a client subtree needs the directive, not every file
  inside it.

Placement rules:

1. Put `'use client'` on the smallest interactive component — the search box, not
   the navbar that contains it.
2. When a client container must show server-rendered content (a modal around a
   server-fetched cart), pass that content as `children` or another element prop.
   The client component then places the output without importing the code.
3. Providers: a dedicated `providers.tsx` (client) that renders `{children}`,
   mounted in a layout, wrapping as little as possible.
4. A third-party component that uses hooks but ships no directive: wrap it in a
   one-line client file of your own, and import the wrapper.
5. Compound components (`Menu.Item`) break across the boundary — the static
   property is `undefined` on the server side. Export the parts as named exports.

## 6. The server-side data layer

For new projects the docs recommend a **Data Access Layer (DAL)**: a server-only
internal library that

- runs only on the server (`import 'server-only'` at the top — importing it from
  a client module becomes a build error);
- performs authorization checks;
- returns minimal DTOs, never raw ORM rows;
- is the only code that reads secrets from `process.env`.

The docs also say: pick one data approach (external HTTP API, DAL, or
component-level queries for prototypes) and do not mix them — a reader and an
auditor should know where data comes from.

Placement: `src/server/` or `src/data/` (one folder, named once), organized by
domain (`data/posts.ts`, `data/users.ts`). Pages and Server Components import
from it; client code never does. The mirror package `client-only` marks modules
that touch `window` and must never run on the server.

## 7. Server Actions

- Place them beside the feature that uses them (`features/posts/actions.ts` or
  `_lib/actions.ts` in the route).
- Keep them thin: validate input, delegate to the DAL, revalidate, return only
  what the UI needs.
- Each action is its own public entry point — a page-level auth check does not
  protect the actions defined in it. The auth check belongs in the DAL function
  the action calls (details: `security` skill).

## 8. Client-rendered apps against a separate backend

Some App Router projects are effectively SPAs: most pages are `'use client'`,
data comes from a separate API (Fastify, Rails, Go) through TanStack Query, and
there is no database access from Next.js at all. For those:

- Sections 5–7 apply only at the edges (root layout, providers). Do not
  prescribe DALs or Server Actions that the architecture does not have.
- Tier 2 is the client API layer: one `lib/api.ts` client plus per-feature query
  hooks with colocated keys.
- Thin pages and colocated `_components/` still apply unchanged.
- Recommend moving work to Server Components only when the user asks about it,
  and say what it would change (bundle, data flow), rather than doing it inside
  an unrelated refactor.
