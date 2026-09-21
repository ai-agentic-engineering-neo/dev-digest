---
name: frontend-ui-architecture
description: "Frontend UI architecture and code organization for React / Next.js App Router — where components, hooks, constants, helpers, types and business logic belong; feature boundaries, public APIs and import rules; thin route files; and where the server/client boundary goes."
when_to_use: "Creating a component, hook, feature or route and deciding where the file belongs; a page.tsx or component has grown and needs splitting; promoting code to shared; naming a folder; placing a 'use client' directive; adding constants or a barrel file; reviewing folder structure or import boundaries; or the user asks some form of 'where should this live'. NOT for how a component should behave (purity, effects, memoization, derived state) — that is react-best-practices; NOT for Next.js API mechanics or performance — that is next-best-practices."
version: 1.0.1
---

# Frontend UI Architecture — Where Code Lives

Placement and boundary rules. This skill answers *where does this code go*, not
*is this code correct*.

Companions — do not duplicate them:
- [react-best-practices](../react-best-practices/SKILL.md) — component/hook
  **behaviour** (purity, derive-don't-store, memoization, effects).
- [next-best-practices](../next-best-practices/SKILL.md) — Next.js **mechanics**
  (file conventions, invalid RSC patterns, async APIs, performance).

Worked before/after: [examples.md](examples.md). Sources, design decisions and
changelog: [README.md](README.md).

## Severity Levels

- **CRITICAL** — breaks boundaries or leaks data; fix before merge
- **HIGH** — will not scale; fix when touching the area
- **MEDIUM** — consistency and readability

---

## The Model

Three tiers, code flows **one direction only**:

```
shared  →  features  →  app
```

- **shared** — no business meaning. Importable from anywhere.
- **features** — one business domain each. May import shared. **Never another feature.**
- **app** — routing and composition. May import features and shared.

Plus one rule on top, because the App Router owns routing:

> **The route file is wiring, not a screen.** `page.tsx` returns a view component
> and nothing else.

This is bulletproof-react's structure plus FSD's thin-route discipline. We
deliberately do **not** adopt FSD's `widgets` / `entities` / `processes` layers —
at this codebase size they are bureaucracy.

## Layout (CRITICAL)

```
src/
├── app/                  # App Router — routing only
│   └── <route>/
│       ├── page.tsx      # thin: returns a view
│       └── _components/  # colocated, single-level (see below)
├── components/           # shared UI, no domain knowledge
├── features/             # business domains (see Feature Boundaries)
├── lib/                  # shared non-UI: api client, hooks, formatters
├── i18n/                 # locale wiring
└── vendor/               # vendored copies — treat as owned source
```

### The component folder

One component per folder. Everything it owns sits beside it:

```
<ComponentName>/
├── <ComponentName>.tsx   # the component
├── <ComponentName>.test.tsx
├── constants.ts          # only if non-trivial
├── helpers.ts            # pure functions, only if non-trivial
├── styles.ts
└── index.ts              # re-export, one line
```

Create `constants.ts` / `helpers.ts` / `styles.ts` **when they earn a file** — a
single constant stays a `const` at the top of the component file. Do not
pre-create empty segment files.

## Thin Route Files (CRITICAL)

A `page.tsx` contains: imports, one component, one `return`. No data fetching,
no query-param parsing, no business rules, no `"use client"`.

```tsx
// app/agents/page.tsx
import { AgentsListView } from "./_components/AgentsListView";

export default function AgentsPage() {
  return <AgentsListView />;
}
```

Everything else — hooks, state, filters, `useSearchParams` — lives in the view.

Why this rule and not "keep pages small":

- **The view becomes testable.** A `*View` renders in RTL directly; a `page.tsx`
  bound to `useParams`/`useSearchParams` does not.
- **The route stops being a catch-all.** When `page.tsx` is the entry point,
  fetches and one-more-business-rule accrete there by default.
- **The `"use client"` boundary stops swallowing the route.** `"use client"` on
  `page.tsx` makes the entire route client-rendered from the root. On the view,
  the route stays a Server Component.

See [examples.md](examples.md) for a real before/after from this repo.

## Colocation (HIGH)

Place code as close to where it is used as possible; things that change together
live together. Promote to shared **on the second consumer**, not in anticipation
of one.

- Used by one component → inside that component's folder
- Used by several components in one route → that route's `_components/`
- Used by two routes / two features → `src/components` or `src/lib`

`_components/` is not routable — App Router only exposes a folder with
`page.tsx`/`route.ts`, and the `_` prefix opts the subtree out entirely.

### `_components` does not nest (HIGH)

```
_components/RunTraceDrawer/_components/TraceSection/   ← NO
```

A second `_components` level means the thing is no longer a component — it is a
feature. Move it to `src/features/<domain>/`. Hard cap: **one** `_components`
level per route.

## Feature Boundaries (CRITICAL)

```
src/features/<domain>/
├── api/          # requests + query hooks for this domain
├── components/
├── hooks/
├── constants.ts
├── types.ts
└── index.ts      # the ONLY public entry
```

- Import a feature **through `index.ts` only**. Never reach into
  `features/x/components/Foo/helpers`.
- **Features never import each other.** Shared need → move the shared piece down
  into `shared`. If two features must talk, the composition happens in `app`.
- A feature exports components and hooks — not its internal helpers, not its
  styles.

## Where Each Kind of Code Goes (HIGH)

| Code | Home |
|---|---|
| One-off UI | component's own folder |
| Reusable UI, no domain knowledge | `src/components/<kebab-name>/` |
| Domain UI | `src/features/<domain>/components/` |
| Data-fetching hook | `src/lib/hooks/<resource>.ts` or `features/<d>/api/` |
| Single-use hook | next to its component |
| Pure transform | `helpers.ts` beside the consumer; `src/lib/` on 2nd consumer |
| Env / runtime config | `src/lib/config.ts` — one module, typed, validated once |
| Domain constants | the owning feature/component; **never** a global `constants.ts` |
| Cross-cutting types | `src/vendor/shared` contracts |
| User-facing strings | `messages/<locale>/*.json` — never inline literals |

### Constants (MEDIUM)

There is no global `constants.ts`. It becomes a bag of everything and couples
unrelated modules through one import.

- Used in one file → `const` at the top of that file
- Used across a component folder → that folder's `constants.ts`
- Used across a feature → that feature's `constants.ts`
- Environment-derived → `src/lib/config.ts`, read from `process.env` **once**,
  validated on load, exported as typed values

Name them; don't scatter magic values. But a named constant used once, in one
place, next to its use, is not worth a file.

## Business Logic (CRITICAL)

Logic never lives in a component body. Where it goes depends on where it runs.

**Pure domain rules** → plain functions in `helpers.ts` / `lib/`. No React
imports, no hooks. Input → output. Directly unit-testable.

**Stateful orchestration** (fetching, subscriptions, coordinated state) → a
custom hook.

> Extraction test, from the React docs: **if you cannot give the hook a clear
> name, it is not ready to be extracted** — the logic is still coupled to the
> component.

**Server-side data access and authorization** → a `server-only` module, never a
component. See *Server/Client Boundary*.

In this repo all data access goes `src/lib/hooks/*` → `src/lib/api.ts`. Never
`fetch` in a component.

## Server/Client Boundary (CRITICAL — Next.js)

The single most consequential structural decision in an App Router app.

`"use client"` declares a boundary between module graphs. Once a file is marked,
**all of its imports and everything it directly renders join the client bundle**
— the directive spreads downward. That is why it belongs at the leaves.

**Rules:**

1. Default to Server Components. Add `"use client"` only where there is state,
   an event handler, a browser API, or a hook that needs one.
2. Push the directive to the **smallest** component that needs it. Never on
   `page.tsx` or `layout.tsx`.
3. **Children escape the boundary.** Server Components passed as `children` or
   props are not in the client module graph — they render on the server and
   arrive as output. A client `<Modal>` can wrap a server `<Cart>`.
4. Render providers **as deep as possible** — wrap `{children}`, not `<html>`.
5. Third-party client-only packages → wrap in your own one-line `"use client"`
   re-export instead of pushing the boundary up.
6. Mark server-only modules with `import "server-only"` — an accidental client
   import becomes a build error instead of a leak.

### Server-side data access

For server-rendered reads, use a Data Access Layer: a `server-only` module that
performs authorization checks and returns minimal DTOs — never raw DB rows or
ORM entities.

- Only the DAL touches `process.env` secrets.
- Server Actions stay thin and delegate to it.
- **Re-check auth inside every Server Action** — a page-level check does not
  extend to actions defined in that page; each action is its own entry point.
- Return only what the UI needs. Return values are serialized to the client.

## Naming (MEDIUM)

Follow what this repo already does — consistency beats any external guide:

- **Module / group folders**: `kebab-case` — `app-shell`, `diff-viewer`
- **Component folders and files**: `PascalCase` — `AgentCard/AgentCard.tsx`
- **Non-component modules**: `kebab-case` — `github-urls.ts`, `repo-context.ts`
- **Hooks**: `useThing` in `useThing.ts`
- **Components**: `PascalCase`, named after what they render

## Imports (HIGH)

- **Always the `@/` alias.** Never `../../../../../components/app-shell`.
  Relative imports are for siblings inside the same folder only.
- Import from the file you need. The alias makes deep paths cheap.
- **No grouping barrels.** A per-directory `index.ts` that `export *`s a folder
  inflates the module graph, breaks tree-shaking and invites circular imports.
- Barrels are allowed in exactly two places: a **component folder** (one-line
  re-export of its own component) and a **feature's public API**. Both re-export
  named symbols explicitly — never `export *`.

## When to Split (HIGH)

Split on **responsibility**, not line count. A responsibility is one axis of
change: render a list, own a form's state, fetch a resource.

Signals it is time:

- You need "and" to describe what it does
- Changing feature A means editing a component named after feature B
- Two blocks of the file change for different reasons, on different schedules
- Props exceed ~7, or several props are only forwarded through
- The file mixes fetching, transforming, and rendering

Signals to leave it alone:

- It is long but does one thing (a big form, a table renderer)
- The extracted piece would only ever have one caller **and** no clear name
- You are splitting to satisfy a line count

## Anti-Patterns

| Anti-pattern | Instead |
|---|---|
| `page.tsx` with hooks, fetches, `"use client"` | thin route + `*View` |
| `_components/` nested in `_components/` | promote to `src/features/` |
| Global `constants.ts` | colocate; `lib/config.ts` for env |
| `../../../../../` imports | `@/` alias |
| `export *` barrel per directory | direct imports |
| Feature importing another feature | move the shared piece to `shared` |
| Deep import into a feature's internals | its `index.ts` |
| `fetch` inside a component | `lib/hooks/*` → `lib/api.ts` |
| `"use client"` at a layout/page root | push to the interactive leaf |
| Passing whole DB rows to a client component | narrow DTO |
| Folder created for one future file | create it on the second file |

## Applying This to Existing Code

Do not restructure a working area on sight. Apply when you are already editing
it, worst offender first:

1. `"use client"` on a route root — it makes the whole route client-side
2. A `page.tsx` doing the work of a view
3. `_components` nesting past one level
4. `../../../` chains where `@/` exists
5. Naming and file-splitting cleanups

Structure changes go in their own commit, separate from behaviour changes.
