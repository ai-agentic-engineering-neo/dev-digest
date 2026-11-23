# Logic placement: constants, helpers, hooks, business logic, data, types

Contents: [Constants](#constants) · [Helpers vs utils vs hooks](#helpers-vs-utils-vs-hooks) · [Business logic](#business-logic) · [Data access](#data-access) · [State placement](#state-placement) · [Types](#types) · [Anti-patterns](#anti-patterns)

## Constants

Scope ladder — use the **lowest** rung that covers the real consumers:

1. **Module top** (above the component) — one consumer, a few lines.
2. **`constants.ts` beside the component** — several files in that component folder, or enough constants to clutter the file.
3. **`constants.ts` at route/feature level** — shared by sibling components of one route (e.g. `pulls/constants.ts`).
4. **`src/lib/`** — genuinely cross-feature.

Conventions: [G1][R5]
- `UPPER_SNAKE_CASE` for true constants (`LOW_CONFIDENCE_THRESHOLD`); `as const` for literal maps/tuples so types narrow.
- Name by meaning, not by value (`LOW_CONFIDENCE_THRESHOLD`, not `POINT_SIX_FIVE`), and add a one-line doc comment when the *why* isn't obvious.
- A constant that is *derived* from data is not a constant — compute it (see `react-best-practices` on derived state).
- **User-facing text is not a constant.** It goes in `messages/<locale>/*.json` so it can be translated; constants may hold the *key*, not the sentence.
- Do not create a project-wide `constants.ts` for everything — it becomes the dumping ground generic `utils` folders become. [R1]

## Helpers vs utils vs hooks

| It is… | Name / place | Test |
|---|---|---|
| Pure, no React, tied to one component/feature | `helpers.ts` beside the consumer | plain unit test, no render |
| Pure, no React, used by 2+ **features**, domain-free | `src/lib/<topic>.ts` | plain unit test |
| Calls any hook (`useState`, `useQuery`, `useContext`…) | `useX` hook — beside the component, or `src/lib/hooks/<domain>.ts` if it talks to the server | `renderHook` |
| Needs props/JSX | a component | component test |

Rules:
- **Pure logic is a helper, not a hook.** If it doesn't call a hook, don't name it `useX` — you'd force callers into the Rules of Hooks for no reason. [D3][R15]
- **Hooks share logic, not state** — two components calling the same hook each get their own state. [D3]
- Prefer a **named, specific** module (`severity.ts`, `format-duration.ts`) over `utils.ts`. Generic buckets attract unrelated code and outlive their callers. [R1][R8]
- A helper takes data in and returns data out; it must not read from hooks, context, `window` or the network — that is what makes it trivially testable and reusable. [P1]
- Promote a helper only when a **second real consumer** exists, and promote exactly one level. [R6][R7]

## Business logic

"Business logic" here = rules about the domain (what counts as a blocking finding, how a verdict is derived, what a valid agent config is), as opposed to UI behaviour (is the drawer open).

Keep it out of JSX and inline event handlers, and split it two ways: [M1][P1][P2]

1. **Pure domain functions** — derive, validate, map API DTO → view model, sort/filter/group. Live in `helpers.ts` (feature-level if shared). No React, no I/O → unit-tested directly.
2. **Orchestration** — "when the user clicks X: call mutation, invalidate these queries, show a toast, navigate". Lives in a custom hook (`useAcceptFinding`) that composes the pure functions with the data layer.

The component then reads like markup: `const { visible, counts, onAccept } = useFindingsPanel(findings)`.

Where does it **not** belong?
- Inside `useEffect` as derived state — compute in render. (`react-best-practices`)
- In `src/vendor/shared` — that's contracts only (zod schemas/types); don't add behaviour there.
- Duplicated client-side when the server is the source of truth — if the API already returns the derived value, display it.

Don't invent layers: a "use case" class, repository and DI container per feature is over-engineering for most UI work. Take the *separation* (pure functions + orchestration hooks) without the ceremony. [P1][R6]

## Data access

- **One door:** components never call `fetch` or the API client directly. They use hooks from `src/lib/hooks/*`, which wrap `src/lib/api.ts`. This keeps URLs, auth, error mapping and caching in one place. [K2]
- **One hook module per domain** (`agents.ts`, `reviews.ts`, `trace.ts`) rather than one giant file or hooks scattered in components. [K2]
- **Query keys** are the cache's addresses. Keep each key next to the hooks that use it; once a key is used in more than one place (query + invalidation + optimistic update), centralize it in a small **key factory per feature** so they can't drift. [Q1][K1]
- Include every variable the query function depends on in the key. [Q1][K2]
- **Server-only fetching** (Server Components, route handlers) belongs in modules importing `server-only`, separate from client hooks. [N3]
- Handle loading/error/empty at the **view** level (the container/view component), not inside each leaf. [M1]

## State placement

Architectural question only — *which owner holds this?* Bug patterns live in `react-best-practices`.

Order of preference: [D4][R9][K2]
1. **Derived** → not state; compute it. [D2][D5]
2. **URL** (filters, sort, pagination, selected tab) → search params / route params, so it survives reload and is shareable.
3. **Server state** → the query cache via a hook; don't copy it into `useState`. [K2]
4. **Local UI state** → the lowest component that needs it. [R9][D4]
5. **Shared UI state** → lift to the closest common parent; context only for true app-wide concerns (theme, active repo, toasts). [D4]

## Types

- **Contracts** (API request/response shapes, enums like `Severity`) come from `@devdigest/shared`. Never re-declare them locally; if a field is missing, change the contract (checking both vendored copies — see the DevDigest profile).
- **Prop types** stay inline in the component file (`interface FindingCardProps`).
- **Types shared by several files of one feature** → `types.ts` in that folder.
- **View models** (shape the UI wants) are derived from contracts with `Pick`/`Omit`/mapped types, not copied by hand, so contract changes fail the typecheck instead of drifting. (Type-level technique: `typescript-expert`.)

## Anti-patterns

- `utils.ts` / `common.ts` / `helpers/index.ts` catch-alls at the repo root.
- A "reusable" hook with hardcoded field names → pass config or make it local.
- A function named `useThing` that calls no hooks.
- Business rules in JSX ternaries or inline `onClick` bodies.
- `fetch(...)` in a component or effect when a hook already exists.
- Server data copied into `useState` "to edit it" with no reset story.
- Constants files holding sentences users read.
