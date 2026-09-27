# Next.js App Router Architecture

Placement and boundaries in App Router. Mechanics — serialization rules, caching, metadata, images — are `next-best-practices`; this file is only about **where code goes and what may import what**. Sources: `README.md` § Next.js.

## The framework is unopinionated, on purpose

Next.js names three equally valid organization strategies and declines to rank them: keep project files outside `app/`, keep them in top-level folders inside `app/`, or split by feature and route. It states directly that folder names like `components`, `lib`, `ui`, `utils` **have no special framework significance**.

So there is no official `lib/` vs `utils/` vs `services/` answer, and anyone claiming one is describing a convention. The de-facto convention the official material actually ships is narrow: `lib/` holds data-fetching functions and framework plumbing, `ui/` or `components/` holds presentation, and a definitions module holds shared schemas and types. `services/` appears nowhere in official material.

Consequence: **pick one and be consistent**. The cost of inconsistency here is much higher than the cost of picking the less fashionable name.

## Colocation inside `app/` is safe by default

A folder is not routable until it contains `page.tsx` or `route.ts`, and only what `page`/`route` returns reaches the client. Project files can sit next to the routes that use them without leaking.

So `_components/` private folders are **not a safety mechanism**. Their real justifications are:

- separating UI from routing concerns,
- editor sorting and consistency,
- and the underrated one: **avoiding collisions with future Next.js file conventions**. Your own `app/blog/template.tsx` or `default.tsx` would collide; `app/blog/_components/Template.tsx` never will.

Route groups `(group)` organize without touching the URL. Three caveats: navigating between routes with *different root layouts* triggers a full page reload; two groups resolving to the same path is a build error; and with multiple root layouts and no top-level layout, `/` must live inside one group.

**Never partition by environment with route groups.** `(client)/` and `(server)/` do not stop anything being routable — a `page.tsx` inside either is a live URL. Signal environment with file names: `lib/stripe/client.ts`, `lib/stripe/server.ts`.

If you use `src/`: `public/`, `package.json`, `next.config.*`, `tsconfig.json` and `.env.*` stay at the root, while `proxy.ts` must move inside. And note the silent failure — `src/app` is ignored if a root `app/` also exists.

## Route-local vs shared

| Scope | Home |
|---|---|
| exactly one route subtree | `app/<route>/_components/<Name>/` |
| two or more unrelated routes | cross-route tier |
| app chrome (header, nav, shell) | cross-route tier |
| domain-free primitives | design-system tier |

Same unidirectional rule as everywhere else, applied to routes. **Route files are thin composition roots**: they assemble feature modules and hold no business logic. That rule is not in the Next.js docs — it comes from the feature-architecture references — but nothing in the framework argues against it.

## The server/client boundary is an architectural boundary

Treat it as a deployment and trust boundary, not a rendering hint.

**Code crosses through imports; data crosses through props.** Whatever a Client Component imports is pulled into the client bundle. Whatever you pass it must be serializable.

- **`'use client'` is an entry point, not a per-file annotation.** You only mark files rendered directly by a Server Component; everything they import is client code automatically.
- **Push the boundary to the leaves.** Mark the interactive component, not the layout that contains it.
- **Wrap, do not convert.** When a shared module needs to be client-side, create a client wrapper that imports it. The shared module stays unchanged and the boundary sits next to your own code. Same technique for third-party components lacking the directive.
- **`children` is the escape hatch**, and it works because of *ownership*: a Server Component that renders `<Modal><Cart /></Modal>` owns both, so `Cart` runs on the server and `Modal` receives its output. `Modal` is only the parent, not the owner.
- **Render providers as deep as possible** — wrap `{children}`, not the whole document.
- **Compound components break across the boundary.** A Server Component importing a Client Component gets a client *reference*, so `Menu.Item` is `undefined`. Use named exports.
- A function prop on a Client Component must be named `action` or end in `Action` — the TypeScript plugin enforces this.

One persistent misconception worth naming: `'use client'` does **not** mean "does not render on the server". A Client Component renders on the server *and* in the browser. The security consequence is what matters — anything SSR'd under a client boundary carries the same trust level as the browser.

## The Data Access Layer

The one placement recommendation in the official material that carries the weight of a recommendation. Three models exist, and the guidance is to **pick one and not mix**, because "exceptions pop out as suspicious":

| Model | For |
|---|---|
| HTTP APIs, called from Server Components | existing large projects and organizations |
| **Data Access Layer** | **new projects** |
| queries inline in components | prototyping and learning |

The DAL contract: runs only on the server, performs authorization, returns minimal DTOs. The governing principle is that a Server Component body should only ever see data the current user is authorized to have.

**The official docs contradict themselves on the path** — `app/lib/dal.ts` in one guide, `data/` in another, both current. The folder name is negotiable. The invariant is not:

> Only the DAL imports the database client and reads `process.env`.

That is lintable, and it is the whole point. Enforce it with `no-restricted-imports` or dependency-cruiser rather than trusting it.

Supporting rules:
- Wrap the current-user lookup in `cache()`. The reason given is architectural, not performance: it lets any module re-read the user instead of passing it down, which is how a user object ends up crossing to the client.
- **Always re-read authorization and cookies when reading data.** Do not pass them as props or params.
- Return DTOs, not rows, shaped per the viewer's permissions.
- Taint APIs are a second line of defence, still experimental, and do not block derived values. They do not replace a DAL.

## Where data fetching lives

- **Fetch in the Server Component that needs it**, not at the top — request deduplication makes this cheap, and prop drilling data is worse than fetching twice. For ORM or DB calls, wrap in `cache()` to get the same property. This is a rule about **Server Components**; the client-side equivalent, where a query cache rather than request dedup does the work, is in [logic.md](logic.md) § The API layer.
- **Colocate a preload function with its consumer** so the dependency moves or dies with the component.
- **Do not fetch your own Route Handlers from Server Components.** It adds an HTTP round trip and fails the build for statically generated routes.
- **Do not use Server Actions to fetch.** They are queued and execute sequentially; `Promise.all` over actions does not parallelize.
- Client fetching is for three cases only: browser-only APIs, polled data, and interaction-dependent data.
- Watch where the `await` sits. A top-level `await` on cookies or the DAL **in a layout** holds `children` behind it; move it into a nested Server Component inside `<Suspense>`.

## Server Actions

**Treat every action as an untrusted public endpoint.** An action is a POST route reachable by anyone who can send the same request. Page-level authentication does not extend into it.

- Re-authenticate and re-authorize inside the action, always.
- Validate every argument. Types are not enforcement, and **schema validation is not authorization** — a well-formed object can still reference a row the caller does not own. Send an id plus the change, derive identity from the session, look up by ownership.
- Closure variables are encrypted; `.bind()` arguments are **not**.
- Constrain return values — return `{ success: true }`, not the updated row.

**Placement is unopinionated** and official examples span `app/actions.ts`, `app/lib/actions.ts`, per-feature `actions.ts`, and inline closures. The structural recommendation that *is* stated: keep actions **thin**. Authorization and data access live in a `server-only` module; the `'use server'` file delegates to it and revalidates. Put the action in the feature that owns the data, and let that feature also own freshness.

Route Handlers, not actions, for: webhooks, OAuth callbacks, public integrations, non-HTML content types, and anything a third party calls.

## Contracts across the boundary

- One schema declaration, imported by both the action and the client form; the types are inferred from it. The schema is a **contract** and is safe to share; the query is a **capability** and must not cross.
- Route-shaped types (`PageProps`, `LayoutProps`, `RouteContext`) are generated globals — do not hand-write them.
- Custom global declarations go in a new `.d.ts` in `tsconfig.include`, never `next-env.d.ts`.

## Layouts are not a boundary

Worth stating because it contradicts an SPA habit that transfers badly:

- A layout does **not** control whether the rest of the route renders. Hiding or swapping children does not stop nested segments running or appearing in the payload.
- `return null` in a layout for an unauthorized user is explicitly not recommended — the app has multiple entry points, and nested segments and Server Actions remain reachable.
- Layouts do not re-render on navigation, so a check placed there does not run on every route change.

Checks belong next to the data, in the DAL.

Likewise, middleware (`proxy.ts` since Next 16) is for **optimistic** checks only — read the session cookie, never hit the database. "Use middleware for auth" is the most persistent piece of bad advice in this area.

## Feature architecture and the `app/` collision

If you adopt FSD on top of App Router, the collision is a name clash: FSD's `app` and `pages` layers against Next's `app/` and `pages/`. The official FSD answer is to rename **both** FSD layers to `_app` and `_pages`, keep Next's `app/` at the project root holding routes only, put FSD layers under `src/`, and have route files re-export page components. `proxy.ts` and `instrumentation.ts` stay at the project root.

The friction is real but shallow: a name clash plus a shape clash, since `app/` is coupled to URLs and therefore cannot itself be the feature tree. The re-export shim is the accepted cost.
