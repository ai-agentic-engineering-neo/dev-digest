# Next.js App Router — architecture reference

Architecture and code placement only. For rendering performance, caching, image/font
optimization and data-fetching speed see the `next-best-practices` skill.

Contents
1. `app/` is for routing
2. Private folders and route groups
3. Where non-route code lives (`app/` vs `src/` root)
4. Server / Client boundary
5. Data access and mutations
6. Route-level states
7. Mapping methodologies (FSD, Bulletproof) onto the App Router
8. DevDigest specifics

---

## 1. `app/` is for routing

A folder in `app/` becomes a route segment; it is publicly reachable only once it has a
`page.tsx` (or `route.ts`). Special files per segment: `layout.tsx` (shared shell, persists
across navigation), `page.tsx` (the route's UI), `loading.tsx`, `error.tsx`, `not-found.tsx`,
`template.tsx`, `route.ts`. *(Next.js — Project Structure; Layouts and Pages)*

**Keep `page.tsx` thin.** It resolves route params / search params and composes a view
component. Feature UI, its constants, helpers and styles live in a private `_components/`
next to it. Why: the route file stays readable as a map of the app, and the view can be
tested and moved without touching routing.

**Layouts are shells, not authorities.** Put navigation, chrome and providers in layouts.
Don't rely on a layout for authorization or as the only place a check runs — layouts don't
re-render on every navigation and aren't a security boundary. *(Robin Wieruch — Authorization in Next.js; OWASP Next.js Cheat Sheet)*

## 2. Private folders and route groups

- **`_folder`** — opts the folder and its children out of routing. Use for colocated
  components, hooks, helpers. Files in `app/` are safe to colocate even without `_`, but
  the underscore makes intent explicit and avoids clashes with future file conventions. *(Next.js — Colocation / Project Structure)*
- **`(group)`** — organizes routes without changing the URL. Use to give a set of routes
  its own layout (e.g. `(marketing)` vs `(studio)`), or to group by team/section. Two groups
  must not resolve to the same URL. *(Next.js — Route Groups)*
- Dynamic segments `[id]`, catch-all `[...slug]` — keep param parsing in `page.tsx`/`layout.tsx`
  and pass typed values down.

## 3. Where non-route code lives

Next.js allows three styles; pick one per project and stay consistent *(Next.js — Project Structure)*:

| Style | Shape | Fits |
|---|---|---|
| Colocate inside `app/` | `app/agents/_components/…` | feature code used by one route tree |
| Shared folders at `src/` root | `src/components`, `src/lib`, `src/features` | code shared across routes |
| `app/` purely for routing | everything in `src/features/*`, routes only import | large apps, FSD/Bulletproof |

A mix is normal: route-specific code colocated in `app/**/_components`, cross-route code in
`src/components` and `src/lib`. That is the DevDigest choice.

## 4. Server / Client boundary

*(Next.js — Server and Client Components; Server/Client Boundary guide; Composition Patterns)*

- Components are **Server Components by default**. `'use client'` at the top of a file marks a
  **boundary in the module graph**: that file and everything it imports become client code.
- **Push `'use client'` to the leaves** — the interactive island (a button with state, a form),
  not the page or layout. Placing it high turns the whole subtree into client code.
- **Interleave via `children`:** a Client Component can render Server Component output passed
  as `children`/props without importing it, so the server part stays on the server.
- **Props crossing the boundary must be serializable** (plain data; no functions except Server
  Actions, no class instances). Design component APIs with that in mind.
- **Wrap client-only third-party components** in your own `'use client'` file, then use the
  wrapper from server code.
- **Context providers** are client components; render them as high as needed but wrap
  `{children}` so the tree below can stay server-rendered.
- Mark modules that must never ship to the browser with `import 'server-only'` (build fails
  if a client file imports them); mirror with `import 'client-only'` for browser-only code.

## 5. Data access and mutations

*(Next.js — Data Security; Updating Data; Next.js blog — Security of Server Components and Actions; Next.js + TanStack Query guide; TanStack — Advanced SSR)*

- **One data-access layer.** Either a server-only DAL (when Next talks to the DB / secrets
  directly) or an HTTP client + query hooks (when a separate API exists). Not both for the
  same data — two paths drift.
- **DAL (if used):** server-only module, does auth checks, returns minimal DTOs (not raw DB rows);
  only the DAL reads secrets from `process.env`.
- **Server Actions are public endpoints** even if not imported anywhere. Keep them thin:
  parse/validate input → authorize → call DAL/service → `revalidatePath`/`revalidateTag`.
  Place them in an `actions.ts` next to the feature that uses them; shared ones in a feature
  module, not a global grab-bag.
- **Client-side server state** (TanStack Query): hooks own keys and query functions;
  components use hooks. Optional: prefetch in a Server Component and pass state through
  `HydrationBoundary`, reusing the same `queryOptions` factory on both sides. Don't call
  Server Actions inside a `queryFn`.
- Middleware/proxy is for optimistic redirects and request filtering, not the authorization layer.

## 6. Route-level states

- `loading.tsx` — the segment's suspense fallback (skeleton). Prefer it over ad-hoc
  `isLoading` spinners at page level; keep component-level loading for partial UI.
- `error.tsx` — client error boundary for the segment (must be `'use client'`); offers retry.
  `global-error.tsx` for the root.
- `not-found.tsx` + `notFound()` — for missing resources (e.g. unknown repo id) instead of
  rendering an empty page. *(Next.js — Error Handling)*

## 7. Mapping methodologies onto the App Router

- **Feature-Sliced Design:** keep Next's `app/` as routing only; FSD layers under `src/`
  (`app` → `views`(renamed from `pages` to avoid clashing) → `widgets` → `features` →
  `entities` → `shared`); `page.tsx` re-exports a `views/*` slice. Use when the team already
  knows FSD or the app is large. *(FSD × Next.js articles)*
- **Bulletproof React:** `src/features/<feature>/{api,components,hooks,types,utils}`, with
  `app/` routes composing features; features don't import each other; shared code flows down. *(Bulletproof React)*
- Small/medium apps don't need either in full — colocation + `components/` + `lib/` is enough.
  Introduce a `features/` layer only when route-colocated code is being imported across routes a lot.

## 8. DevDigest specifics (`client/`)

- Next.js 15 App Router, React 19, TanStack Query 5, next-intl. `src/app` + `src/components`
  + `src/lib` + `src/vendor`.
- Client-rendered studio over the Fastify REST API (`:3001`): pages render client views;
  there are **no Server Actions** and no server-side DAL. Data path is fixed:
  component → `src/lib/hooks/<domain>.ts` → `src/lib/api.ts` → API.
- Don't add Server Actions or `app/api/*` route handlers that duplicate the Fastify API —
  business rules and secrets belong to `server/` (`LocalSecretsProvider`).
- Route-specific code: `src/app/<route>/_components/<Name>/` (recursive `_components/`
  inside a view for its parts). Cross-route components: `src/components/<kebab-name>/`
  with an `index.ts` public API.
- UI strings: `messages/en/*.json` via next-intl, never hard-coded.
