# Business Logic Placement

Which of component / hook / plain function / server owns a given rule. Sources: `README.md` § Logic and state.

## The mechanical rule first

If a function calls a React hook, it **is** a hook and must be named `use*`. If it does not, it must be a plain function and must **not** be named `use*` — `useSorted` that calls nothing is `getSorted`.

This is not naming pedantry. A plain function can be called conditionally, in a loop, from a test, from a route loader, or on the server. A hook can be called from exactly one place: a component body. Every `use*` prefix on logic that did not need React narrows where that logic can ever be used.

## The placement ladder

1. **Pure derivation** — compute it during render. Never `useState` + `useEffect` to keep a value in sync with another value. This one rule removes most of what people call "component logic".
2. **Triggered by a user action** — put it in the event handler. Logic shared by two handlers goes in a plain local function, not an Effect.
3. **Stateful, tied to React, named after a use case** — a custom hook.
4. **A rule that does not need React at all** — a plain function in the feature's model module.
5. **A rule the client must not be trusted with** — the server. Authorization, pricing, anything whose enforcement matters.

Effects are for synchronizing with an external system. Before writing one, name the external system out loud. If you cannot, it is one of 1, 2 or 4.

### Imperative browser side effects

Downloads, clipboard writes, `print()`, focus management, scroll position, fullscreen. These touch an external system, which makes them look like Effect material — they are not, because they are **triggered by an action rather than synchronized with state**. They belong in the event handler.

Split them in two:

- The **pure part** — building the CSV text, formatting the clipboard payload — is a plain function, testable in Node with no DOM.
- The **effectful part** — `Blob`, `URL.createObjectURL`, the synthetic `<a download>` click, `revokeObjectURL` — stays inline in the handler.

The split is the point: the interesting logic gets unit tests, and the untestable browser dance stays small enough to read. Keep the pure part dependency-free, since anything it imports is pulled into the client bundle with it.

## Hooks are the seam, not the home

A hook's job is to adapt something — an external system, a server cache, a store — into React. Domain rules should be plain functions the hook calls, because that is what makes them testable without a renderer.

This is the honest weak point of hook-centric architecture: hooks cannot be called outside a component, so they are not unit-testable as functions. You test them through a component. Plain domain functions get fast, framework-free tests — which is the practical argument for pushing rules out of hooks, not a purist one.

**Extract a hook when it names a use case, not when it relocates a call.** `useChatRoom` and `useOrderProducts` earn their existence. A hook whose entire body is one `useQuery` call adds a layer and hides nothing.

**Do not build lifecycle wrappers** (`useMount`, `useUpdateEffect`). Named-by-use-case hooks survive React's evolution; generic wrappers around the reconciler do not.

**When a non-component caller might need it, the abstraction must not be a hook.** Prefetching, route loaders, server code and tests are all non-component callers. The portable unit is a plain function returning an options object; the hook is a thin wrapper over it.

## Container / Presentational

Retracted by its author in 2019: he no longer suggests splitting components this way, having watched it "enforced without any necessity and with almost dogmatic fervor". Hooks removed the arbitrary division. Its popularity was largely an artifact of Redux's `connect()`.

Do not reintroduce it as a rule. But note the shape came back on its own at the RSC boundary — a Server Component fetches and shapes, a `'use client'` leaf renders and handles interaction. The difference matters: that boundary is enforced by the module graph and motivated by bundle size and data access, not by a style preference.

The consequence worth internalizing: genuinely reusable presentational components are now a **narrow, deliberate category**, not half the codebase.

## The four kinds of state

Conflating these is the root state-architecture smell. Each has exactly one right home.

| Kind | Home | Rule |
|---|---|---|
| **Server state** | query cache, keyed | You are borrowing it. The server owns it. |
| **URL state** | search params / route params | Shareable and back-button-able belongs in the URL |
| **Form state** | the form library / local state | The bounded exception — see below |
| **Client UI state** | the component, or a small scoped store | What is left after the other three leave |

**Server state is borrowed, not owned.** Never copy fetched data into `useState`, Redux or Zustand. The canonical failure: you sync it into local state, a background refetch lands, and the user's in-progress selection is silently overwritten. Tune staleness instead of copying.

**URL state is first-class.** Filters, tabs, pagination, search, the selected row — all of it is shareable, bookmarkable and survives reload, and in App Router it is readable on the server without prop drilling. Most state in most apps is server state or URL state.

Security corollary: search params and route params are **user input**. Never authorize off them, and re-verify on every read.

**Form state is the one legitimate copy of server state** — a form must hold an edit that has not been saved yet. Make it deliberate: disable background updates while the form is dirty, or derive per field (touched → client, untouched → server).

**Client UI state, by subtraction.** Move server data to the cache and URL-shaped data to the URL first, then see what is left. It is usually very small — theme, sidebar, a modal. Colocate first, lift second, scoped context third, store last. Scope providers to the subtree that needs them; a provider at the root layout is a god component.

For stores: prefer several small feature stores over one app store, export custom hooks with atomic selectors rather than the store object, and model actions as **events, not setters**. (One genuine disagreement exists here: Redux's official guidance puts as much logic as possible in reducers for testability and time-travel, which centralizes logic in the store; the colocation camp shrinks the store to near-nothing. Both agree local state stays local, forms stay out of the global store, and every piece of state has exactly one obvious home.)

## The API layer

- **One configured client instance** — base URL, auth, interceptors — in the shared tier. A second HTTP client in the same app is a bug.
- **One file per endpoint**, holding request/response types, the validation schema, the fetcher, and the hook built on it. Colocation makes the endpoint discoverable and lets type inference flow downstream.
- **Query keys live next to their fetcher**, treated like a dependency array.
- **Prop or re-call the hook?** Inside a query cache, calling the same hook again in a leaf is cheap — the request is deduped, not repeated. Prefer the prop when the child must show *the same set the parent is showing* (a filtered or sorted view; re-querying would silently diverge from what is on screen). Prefer re-calling the hook when the child needs the data independently and passing it would mean threading props through layers that do not use them. The cost of re-calling is not a request; it is one more component subscribed to refetches.
- **Features own their endpoints.** The shared `api/` holds only the client and endpoints many features genuinely share.
- Generated clients fit as the "types + fetcher" half. Wrap them thinly — the best abstractions are not configurable.

## Domain models and mapping

The API response shape is usually enough. Do not build a model layer on principle.

You need a mapping layer when the response shape and the screen's needs **diverge** — storage shapes and view shapes rarely coincide, and view shapes are fickle, changing with the next redesign. Where the mapping goes is genuinely contested: server-side in a BFF or Server Component, a client-side adapter, or the feature's own `api`/`model` segment. What no source disputes is that the **raw backend shape should not propagate untranslated into components**.

When the upstream is legacy or hostile, the mapping is an anti-corruption layer: translation only, no business rules inside it. It is not warranted when the semantics already match.

## Validation

**Parse at the boundary and return a refined type.** Validate once, at the edge, and let everything downstream operate on a type that already encodes validity. The failure mode is re-checking the same validity in scattered places.

- The schema lives **with the request it guards**, not in a global `schemas/` bucket.
- The **server owns the authoritative copy**. A client-side schema is UX; the server-side check is the enforcement. Both are required, and the duplication is deliberate.
- Types are not enforcement. A `'use server'` action receives whatever the caller sends.
- Do not return raw validation errors to the client — internal field paths leak structure.

## Clean Architecture on the frontend

Genuinely contested, and the two camps are arguing about different codebases.

**Adopt the full apparatus** — domain, use cases, ports, adapters — when the frontend holds real rules: pricing, permissions, multi-step workflows, offline or optimistic behaviour. Then those rules become testable with no browser and no React, which is the whole payoff. Its own proponents note it is overkill on small projects, raises the onboarding threshold, and adds bundle size.

**Do not adopt it** when the rules live on the server and the frontend is a rendering layer over them — which is the common case. The mainstream production references carry no use-case or repository layer at all, and the source of the layering idea explicitly warns against making layers the *top-level* structure rather than domain modules that are internally layered.

Both camps agree on the cheap parts: **the dependency direction rule, and extracting pure domain functions**. Take those unconditionally. The ports and DI apparatus is what must be paid for with demonstrated complexity.
