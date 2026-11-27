---
name: frontend-ui-architecture
description: "Frontend UI architecture and code organization for React + Next.js App Router: where components, constants, helpers/utils, hooks, types, styles, business logic and data access live; how to split components; Server/Client boundary placement; route folders, private _folders, route groups; import direction and public APIs (index.ts). Use whenever creating, moving, splitting or reviewing frontend files or folders, adding a new page/feature/component, deciding \"where should this go?\", extracting logic out of a component, or refactoring a growing component — even if the user doesn't say \"architecture\". Not for performance, memoization or bundle size (see react-best-practices / next-best-practices)."
metadata:
  version: 1.0.0
  updated: 2026-11-27
  scope: architecture-and-organization-only
---

# Frontend UI architecture

How to organize a React + Next.js (App Router) frontend so that a reader can find
any piece of code by asking "what feature is this for?" and "what kind of thing is it?".
Rules here are about **placement, boundaries and responsibilities** — not performance.
Performance, memoization, hook misuse and RSC data-fetching speed live in
`react-best-practices` and `next-best-practices`; don't duplicate them here.

Each rule names its sources in *(italics)*; full links are in [README.md](README.md).

**Read next, when relevant:**
- [references/nextjs-app-router.md](references/nextjs-app-router.md) — route folders, Server/Client boundary, Server Actions / data-access placement, route-level states.
- [references/examples.md](references/examples.md) — good/bad folder trees and refactors.

---

## 0. Core principles (the "why" behind every rule below)

1. **Colocate by default, promote only when shared.** Code that changes together lives together. A file starts next to its only consumer and moves up only when a *second* feature actually needs it. Premature `shared/` folders become dumping grounds. *(Kent C. Dodds — Colocation; Max Rozen; React legacy FAQ)*
2. **Group by feature first, by file type second.** The top level should "scream" the domain (agents, repos, reviews), not the framework (components, hooks, utils). Inside a feature, split by kind. *(Bulletproof React; Feature-Sliced Design; Screaming Architecture)*
3. **Dependencies flow one way:** routes → features → shared components → lib/utils → vendor/contracts. Lower layers never import from higher ones; sibling features don't import each other's internals. *(Bulletproof React; FSD layers; eslint-plugin-boundaries)*
4. **Separate view, behaviour and data.** Components render; hooks orchestrate state and effects; pure functions hold rules and transforms; one data layer talks to the network. *(Fowler/Qiu — Modularizing React Apps; patterns.dev hooks pattern; TkDodo)*
5. **Avoid hasty abstractions.** Duplicate twice, abstract on the third time when the shape is clear. A wrong abstraction costs more than duplication. *(Kent C. Dodds — AHA; Stack Overflow blog — Don't build the reusable component yet)*
6. **Consistency beats the "perfect" layout.** Follow the project's existing convention even if another one is fashionable; neither React nor Next.js mandates a structure. *(React legacy FAQ; Next.js Project Structure)*

---

## 1. Quick lookup: "where does X go?"

Generic React/Next layout first, then the DevDigest (`client/`) equivalent. When working
in this repo, use the DevDigest column — it matches `client/AGENTS.md`.

| Thing | Generic placement | DevDigest `client/src/` |
|---|---|---|
| Route entry | `app/<route>/page.tsx` — thin, composes a view | `app/<route>/page.tsx` renders `<XxxView />` only |
| Component used by one route | colocated under the route, private folder | `app/<route>/_components/<Name>/` |
| Sub-part of one component | nested inside that component's folder | `<Name>/_components/<Part>/` |
| Component reused by ≥2 features | `components/<name>/` (or `features/<f>/` public API) | `components/<kebab-name>/` |
| Design-system primitive (Button, Modal) | `components/ui/` or a UI package | `vendor/ui` — reuse before adding |
| Constants for one component | `<Name>/constants.ts` | same |
| App-wide constants / config | `config/` or `lib/constants.ts` | `lib/<topic>.ts` (only once ≥2 features use it) |
| User-visible text | i18n messages, never constants | `client/messages/en/*.json` via next-intl |
| Pure helper for one component | `<Name>/helpers.ts` | same |
| Pure app-wide util (format, parse) | `lib/` or `utils/`, React-free, tested | `lib/<topic>.ts` + `<topic>.test.ts` (e.g. `format-cost.ts`) |
| Styles | next to the component | `<Name>/styles.ts` |
| Types for one component | top of `Name.tsx` or `<Name>/types.ts` | same |
| API/domain contracts | shared contracts package | `vendor/shared` (two copies — update both) |
| HTTP client | one module | `lib/api.ts` — the only `fetch` caller |
| Server-state hooks (queries/mutations) | `features/<f>/api/` or `lib/hooks/` | `lib/hooks/<domain>.ts` |
| UI-behaviour hook for one component | `<Name>/hooks/useX.ts` or inside `Name.tsx` | `<Name>/hooks/` (see `components/app-shell/hooks/`) |
| Context provider used app-wide | `providers/` or `lib/` | `lib/*.tsx` (`theme.tsx`, `toast.tsx`, `repo-context.tsx`) wired in `lib/providers.tsx` |
| Tests | next to the file they test | `<Name>/<Name>.test.tsx` |

---

## 2. Components: placement and splitting

### Folder-per-component
A non-trivial component gets its own folder:

```
<Name>/
  Name.tsx          # the component (default place for its small types)
  index.ts          # public API: re-exports only what outsiders may use
  constants.ts      # static values used only here
  helpers.ts        # pure functions used only here
  styles.ts         # styles
  Name.test.tsx     # colocated test
  hooks/            # only if it has its own behaviour hooks
  _components/      # private sub-components, same shape recursively
```

Why: everything that changes with the component is in one place, deletion is one `rm -rf`,
and `index.ts` makes the boundary explicit. Create the extra files **when there is content
for them** — an empty `constants.ts` is noise. *(Robin Wieruch — React Folder Structure; Josh Comeau — File Structure)*

### When to split a component
Split when one of these is true — not because of a line count alone:
- it does **two jobs** (e.g. fetches + lays out + renders list items) — split by responsibility;
- a region has **its own state** that the rest doesn't care about — push that state down into a child; *(react.dev — Sharing State; Kent C. Dodds — State Colocation)*
- a region is **repeated** or has a name you'd use in conversation ("the comment thread") — give it a component;
- the file is hard to scan (≈200+ lines is a smell, not a rule).

Prefer **composition** (`children`, slot props) over props that are only passed through.
If a wrapper doesn't use a prop, let the parent render the content and pass it as `children`. *(react.dev — Thinking in React; patterns.dev — Compound pattern)*

### Where a new component starts, and when it moves
1. Starts in the route's `_components/` (or the parent component's `_components/`).
2. A second feature needs it → move to `components/<kebab-name>/` with an `index.ts`. Update imports; don't leave a re-export behind.
3. It becomes generic, unstyled-by-domain UI → consider the design-system layer (`vendor/ui` here — check first, it may already exist).

Don't create a reusable component "just in case": generic APIs designed before there are
two real callers are almost always wrong. *(AHA; Don't build the reusable component yet)*

---

## 3. Constants

- **Colocate** in `<Name>/constants.ts`. Promote to `lib/` only when a second feature imports it. *(Wieruch; Rozen)*
- **Naming:** `CONSTANT_CASE` for true module-level constants (limits, keys, lookup tables); `camelCase` for derived/config objects that behave like values. Mark with `as const` so types are literal. *(Google TypeScript Style Guide)*
- **Not constants:** user-visible strings (→ i18n messages), values derived from props/state (→ compute during render), values from the server (→ data layer), secrets/env (→ server or `NEXT_PUBLIC_*` config module, never hard-coded).
- **Magic values** used in logic (timeouts, page sizes, status maps) get a named constant near their use, so the meaning is visible in review.

## 4. Helpers vs utils

Both are **pure functions without React** (no hooks, no JSX, no imports from `react`).
That's what makes them trivially unit-testable and movable.

| | `helpers.ts` (local) | `lib/<topic>.ts` (shared util) |
|---|---|---|
| Used by | one component/feature | ≥2 features |
| Knows domain? | yes, freely | only generic or contract-level domain |
| Tested | via the component test, or own test if logic is non-trivial | always its own `*.test.ts` |
| Naming | verb-first: `formatRunLabel`, `groupByFile` | topic file: `format-cost.ts`, `github-urls.ts` |

- Extract a function out of the component body when it doesn't need closure over state, or when it's a rule worth testing alone. *(Fowler/Qiu; react.dev — Keeping components pure)*
- Name files by **topic**, not `utils.ts` / `misc.ts` at the app level — a generic name attracts unrelated code.
- Anything that needs hooks is a **hook**, not a helper (§5).

## 5. Business logic, state and data

Think in three layers *(Fowler/Qiu — Modularizing React Applications)*:

1. **View** — components. Read props/hook results, render, forward events. No `fetch`, no business rules inline.
2. **Behaviour** — custom hooks (`useX`). Combine state, effects, queries; expose a small, named API (`{ items, select, isSaving }`). Custom hooks share *logic*, not state — two callers get two states. *(react.dev — Reusing Logic with Custom Hooks)*
3. **Domain & data** — pure domain functions (rules, mapping, validation) + a single data-access layer (HTTP client + query/mutation hooks). *(TkDodo — Practical React Query; Next.js — Data Security / DAL)*

Rules:
- **One door to the network.** Components never call `fetch`; they call a data hook, which calls the HTTP client. In DevDigest: component → `lib/hooks/<domain>.ts` → `lib/api.ts`. Missing data? Extend a hook, don't call `api` from a component.
- **Server state ≠ UI state.** Server data lives in TanStack Query (don't copy it into `useState`); URL-shareable state (filters, tabs, selected id) lives in search params/route segments; ephemeral UI state lives in `useState` in the lowest component that needs it; Context only for truly cross-cutting values (theme, current repo, toasts). *(react.dev — Choosing the State Structure; TkDodo)*
- **Derive, don't store.** If it can be computed from props/state/query data, compute it during render (or in a pure helper). *(react.dev — You Might Not Need an Effect)*
- **Effects are for syncing with external systems** — not for transforming data or reacting to user events (put that in the event handler). *(react.dev — You Might Not Need an Effect)*
- **Query keys and options belong with the hooks**, not in components. For new hook files prefer a per-domain key factory / `queryOptions` so invalidation is consistent. *(TkDodo — Effective React Query Keys; The Query Options API)*
- **Authorization and real business rules live on the server.** The frontend may *mirror* a rule for UX (disable a button) but is never the source of truth. In DevDigest the Fastify server owns rules; the client renders results. *(Next.js — Data Security; OWASP Next.js Cheat Sheet)*
- **Validate at boundaries.** Data entering from the network or a form gets parsed/validated once at the edge (contracts / zod), so inner code can trust its types.

## 6. Imports, public APIs and boundaries

- A component/feature folder exposes its **public API through `index.ts`**; outsiders import `@/components/diff-viewer`, never `@/components/diff-viewer/FileCard/FileCard`. Internal files import each other by relative path. *(Bulletproof React; FSD — public API)*
- `index.ts` only **re-exports what outsiders need** — not `export *` of every file. Deep barrel chains (barrels re-exporting barrels across the app) hurt tooling and create cycles; keep barrels one level, at a folder's boundary. *(TkDodo — Please Stop Using Barrel Files; Marvin Hagemeister — barrel file debacle)*
- **Allowed direction:** `app/` → `app/**/_components` → `components/` → `lib/` → `vendor/`. Never import from `app/**` into `components/` or `lib/`; never from one route's `_components` into another route — promote the shared piece to `components/` instead. *(Bulletproof React — unidirectional architecture)*
- Use the path alias (`@/…`) across folders, relative paths within one component folder.
- Enforce once the rules are stable: `eslint-plugin-boundaries` or `no-restricted-imports`. *(eslint-plugin-boundaries)*

## 7. Next.js App Router — architecture summary

Full detail and rationale in [references/nextjs-app-router.md](references/nextjs-app-router.md).

- `app/` is for **routing**: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`. Keep `page.tsx` thin — it reads params and composes a view.
- Put non-route code for a route in **private folders** (`_components/`) so it can never become a URL. Use **route groups** `(group)/` to share a layout across sections without changing URLs.
- Default to **Server Components**; push `'use client'` down to the interactive leaves. A file with `'use client'` makes everything it imports client code. Pass server-rendered output into client components as `children`. Props crossing the boundary must be serializable.
- Route-level loading/error/empty states go in the segment's `loading.tsx` / `error.tsx` / `not-found.tsx`, not ad-hoc in each page.
- Server-only modules (secrets, DB, privileged calls) start with `import 'server-only'`. Server Actions stay thin: validate input → call a server module → revalidate.
- **DevDigest today:** client is a client-rendered studio over a REST API — ~all components are `'use client'`, no Server Actions, all data via `lib/hooks` → `lib/api.ts` → Fastify `:3001`. Keep it that way unless a change is explicitly decided; don't add a second data path (Server Actions/route handlers duplicating the API).

---

## 8. Checklist before you finish a frontend change

- [ ] Each new file sits next to its only consumer, or in a shared folder because ≥2 features use it.
- [ ] `page.tsx` is thin; feature UI is in `_components/<Name>/`.
- [ ] No component calls `fetch`/`api` directly; data goes through a hook in the data layer.
- [ ] No server data copied into local state; nothing stored that could be derived.
- [ ] Pure logic extracted to `helpers.ts` / `lib/` has no React imports and (if non-trivial) a test.
- [ ] Constants are named, colocated, `as const`; no user-visible text in constants (i18n instead).
- [ ] Imports go downward only; outsiders use the folder's `index.ts`; no cross-route `_components` imports.
- [ ] `'use client'` is at the lowest sensible level (or matches the project's client-rendered convention).
- [ ] The change follows the existing folder convention of the module rather than introducing a new one.

When reviewing code, report violations as: rule (section number) → file → concrete move/fix,
e.g. "§5 one door to the network — `AgentCard.tsx` calls `api.get` → add `useAgentStats` in `lib/hooks/agents.ts`".
