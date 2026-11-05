# Next.js App Router: architecture rules

Read this when you add a route or layout, move the `'use client'` boundary, or anyone proposes
Server Actions, Route Handlers or direct data access in `client/`. Performance, caching, metadata
and file-convention details live in the `next-best-practices` skill.

## Contents

1. Organizing `app/`
2. Server / client boundary
3. Data-handling model (current and future)
4. If a server layer is ever introduced

---

## 1. Organizing `app/`

Next.js is unopinionated about organization. Its docs list three strategies:

- project code outside `app/`;
- shared folders at the root of `app/`;
- split by feature or route.

The real rule is to **pick one and be consistent**. DevDigest uses the third: global code in
`src/components` / `src/lib`, specific code colocated in the route segment that uses it.

| Need | Use |
|---|---|
| New URL segment | folder with `page.tsx` (lowercase; dynamic `[camelCase]`) |
| UI used only by this route | `<segment>/_components/<Name>/` (`_` = private, never routable) |
| Non-UI used only by this route | `<segment>/helpers.ts`, `constants.ts`, `styles.ts` |
| Share a layout between some routes without changing URLs | route group `(groupName)/layout.tsx` |
| Loading / error UI for a segment | `loading.tsx` / `error.tsx` in that segment |

`page.tsx` default-exports `<Name>Page`. It reads `params`/`searchParams`, calls hooks and composes.
Routes **assemble** features, they don't implement domain logic.

Only what `page.tsx` / `route.ts` returns is public, so colocated files are safe. The `_` prefix
also separates UI from routing and avoids clashes with future Next.js file names.

## 2. Server / client boundary

- Components in `app/` are Server Components unless the file (or something importing it) says
  `'use client'`.
- `'use client'` marks a **module-graph boundary**: the file and everything it imports go to the
  client bundle. Children passed as `children`/props are *not* pulled in.
- Put the directive on the **leaf that needs interactivity** (state, effects, event handlers,
  browser APIs, custom hooks), not on the layout or page around it.
- **Interleaving:** a client wrapper can receive server-rendered UI as `children`
  (`<Modal><Cart/></Modal>`).
- **Context:** a `'use client'` provider that wraps `{children}`, placed as deep as possible.
  In DevDigest, global providers are in `src/lib/providers.tsx`.
- **Third-party client-only component:** re-export it from your own `'use client'` file.
- Props crossing server → client must be **serializable** and **minimal**. Pass the fields the
  component needs, not a whole record.

DevDigest today: pages are client components that load data via TanStack Query hooks. Keep that
for features in the same area. Introduce server-rendered pages only as a deliberate,
user-approved change, not as a side effect.

## 3. Data-handling model

The Next.js Data Security guide offers three models and says to **choose one and not mix them**:

| Model | When | DevDigest |
|---|---|---|
| HTTP APIs (call an existing backend) | existing or large apps, separate backend | **current**: Fastify `:3001` via `api.ts` + hooks |
| Data Access Layer | new full-stack Next.js projects | not used |
| Component-level queries | prototypes only | never |

Consequences for `client/` now:

- All reads and writes go `component → hook (src/lib/hooks) → api.ts → Fastify`.
- No `'use server'`, no `app/**/route.ts`, no DB clients, no secrets. Only `NEXT_PUBLIC_*` env vars
  are visible to client code anyway.
- Need a new endpoint? It belongs in `server/`, plus a hook here.

## 4. If a server layer is ever introduced

Only after the user explicitly decides on it. Then follow the official model:

- **DAL**: one `server-only` module tree (e.g. `src/server/data/`). It is the only code that touches
  the DB or `process.env` secrets. Every function checks authentication **and** authorization and
  returns a minimal **DTO**.
- **Server Actions** are public POST endpoints. Keep them thin, re-check auth inside each, validate
  args (Zod), delegate to the DAL and return only what the UI needs. Colocate an action with the
  feature that uses it, and promote to a shared folder when a second feature needs it.
- **Route Handlers** only for external callers: webhooks, OAuth callbacks, public or cacheable GET.
- Mark server modules with `import 'server-only'` and browser-only modules with `'client-only'`,
  so a wrong import fails the build.
- Never mutate during render. Reads go through Server Components, writes through Server Actions.
