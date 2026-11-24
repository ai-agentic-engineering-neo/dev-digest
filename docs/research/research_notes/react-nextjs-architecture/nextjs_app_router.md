# Next.js App Router: architecture and project organization (sources + recommendations)

Scope: how to structure a Next.js App Router codebase (architecture, not performance/caching tuning). Research date: 2026-11-24.

**Version note, read first.** The live nextjs.org docs now describe **Next.js 16** (released 2025-10-21), not 15. Architecture guidance is unchanged between 15 and 16, but some names differ: `middleware.ts` is now `proxy.ts`, `refresh()`/`updateTag()` exist only in 16, and 16 drops sync `params`/`cookies()` access. The DevDigest client pins `next ^15.5.29`, `next-intl ^3.26.5`, `@tanstack/react-query ^5`, and has `src/app`, `src/app/_components`, `src/components`, `src/lib`, `src/i18n`, `src/vendor` (checked in `client/package.json` and `client/src`). A skill that cites current docs should mark 16-only APIs as such. Source: [Next.js 16 blog](https://nextjs.org/blog/next-16).

Outdated (Pages Router or early App Router) advice to flag: `getServerSideProps`/`getStaticProps`, `pages/api` API Routes as the default backend, sync `params`/`cookies()` (removed in 16), `middleware.ts` (deprecated in 16), and the `nextjs.org/docs/13|14/.../routing/colocation` URLs (superseded by the project-structure page).

---

## 1. Official project structure and organization

### Takeaway
Next.js is officially "unopinionated" about structure. It offers four tools: safe colocation in `app/`, private `_folders`, route `(groups)`, and an optional `src/`. It describes three equally valid strategies and asks only that you pick one and stay consistent.

### Cited Findings
- **Source:** https://nextjs.org/docs/app/getting-started/project-structure (lastUpdated 2026-07-21). Answers: which folder and file conventions exist, and how to organize a project.
- Next.js "is **unopinionated** about how you organize and colocate your project files." — [Project structure](https://nextjs.org/docs/app/getting-started/project-structure)
- **Colocation:** a route is not public until a `page.js` or `route.js` exists, and only the content those files return reaches the client. So project files "can be safely colocated inside route segments in the `app` directory without accidentally being routable." Colocation is optional ("you **can** … you don't **have** to"). — [Project structure](https://nextjs.org/docs/app/getting-started/project-structure)
- **Private folders** (`_folderName`) opt the folder and all its subfolders out of routing. They are not required for colocation, but the docs list four uses: separating UI logic from routing logic, organizing internal files consistently across the project and ecosystem, sorting and grouping in editors, and avoiding conflicts with future Next.js file conventions. Examples: `app/blog/_components/Post.tsx`, `app/blog/_lib/data.ts`. — [Project structure](https://nextjs.org/docs/app/getting-started/project-structure)
- **Route groups** (`(folderName)`) are left out of the URL. Uses: organizing by site section, intent or team; nested or multiple root layouts; opting a subset of routes into a layout; scoping a `loading.tsx` to one route, e.g. `/(overview)`. — [Project structure](https://nextjs.org/docs/app/getting-started/project-structure)
- **`src/` folder** is optional and "separates application code from project configuration files." — [Project structure](https://nextjs.org/docs/app/getting-started/project-structure)
- **The three strategies:** (1) "Store project files outside of `app`": `app` is "purely for routing purposes" and code lives in shared root folders. (2) "Store project files in top-level folders inside of `app`". (3) "Split project files by feature or route": globally shared code at the root of `app`, specific code in the route segments that use it. Guidance: "choose a strategy that works for you and your team and be consistent across the project." `components` and `lib` are placeholder names "with no special framework significance." — [Project structure](https://nextjs.org/docs/app/getting-started/project-structure)
- **Component hierarchy** inside a segment: `layout` > `template` > `error` (error boundary) > `loading` (Suspense boundary) > `not-found` > `page`. These nest recursively inside the parent segment. — [Project structure](https://nextjs.org/docs/app/getting-started/project-structure)
- Top-level file list now includes `proxy.ts` (formerly `middleware.ts`) and `instrumentation.ts`. — [Project structure](https://nextjs.org/docs/app/getting-started/project-structure); [Next.js 16](https://nextjs.org/blog/next-16)

### Inferences
- DevDigest's client already mixes strategy (3), with `src/app/_components`, and strategy (1), with `src/components` and `src/lib`. Both are officially fine. A skill should name the rule, e.g. "route-specific goes into `app/<route>/_components`, shared goes into `src/components`", rather than pick a "correct" strategy.
- Using `_` for private folders is not required for safety, but it is recommended for clarity and future-proofing.

### Gaps
- The docs do not say when a project should move from one strategy to another (no size thresholds).

---

## 2. Server vs Client Component boundaries

### Takeaway
Server Components are the default. Put `'use client'` only on the interactive leaf files, because it marks a module-graph boundary and everything that file imports becomes client code. Compose by passing Server Components as `children` or other props into Client Components. Render providers as deep as possible. Guard server-only modules with `import 'server-only'`.

### Cited Findings
- **Source:** https://nextjs.org/docs/app/getting-started/server-and-client-components (lastUpdated 2026-10-05). Answers: when to use each kind, composition, providers, third-party components, and environment poisoning.
- Use **Client Components** for state, event handlers, effects, browser APIs and custom hooks. Use **Server Components** to fetch data close to the source, use secrets, reduce client JS, and stream. — [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- `"use client"` "is used to declare a **boundary** between the Server and Client module graphs." Once a file has it, "all of its imports and the components it directly renders are included in the client bundle." This does *not* apply to Server Components passed as children or props. — [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- **Push the boundary to the leaves:** "add `'use client'` at the top of the files that define your interactive components instead of marking large parts of your UI as Client Components." Example: a server `Layout` renders a client `<Search />`. — [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- Props from Server to Client Components must be serializable by React. Data can also be streamed with `use()`. — [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- **Interleaving:** a Client Component can expose a `children` slot, e.g. a `<Modal>` that wraps a server-fetched `<Cart>`. Server Components are rendered on the server ahead of time even when passed as props. — [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- **Context providers:** context does not work in Server Components. Make a `'use client'` provider that takes `children` and render it from a layout. "You should render providers as deep as possible in the tree," e.g. wrap `{children}` rather than `<html>`. — [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- **Third-party client-only components** that lack the directive: re-export them from your own `'use client'` file. — [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- **Environment poisoning:** `import 'server-only'` makes the build fail if a Client Component imports the module. `client-only` is the mirror for `window`-using code. Installing either package is optional, because Next.js handles them internally. Only `NEXT_PUBLIC_*` env vars reach the client. — [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- **React reference:** `'use client'` marks "the module and its transitive dependencies as client code." It must be the first statement and is a no-op inside already-client code. Props crossing the boundary must be serializable: functions, classes and class instances are not, while Server Functions, JSX and Promises are. Client-ness depends on *where a component is used*, not where it is defined. — [react.dev `'use client'`](https://react.dev/reference/rsc/use-client)
- **Common mistakes (Lee Robinson, Vercel blog, 2024-01-08):** adding `"use client"` unnecessarily ("You don't need to add `"use client"` to every file"); using context in Server Components instead of a separate client provider; calling Route Handlers from Server Components; calling `redirect()` inside try/catch; and believing Client Components need a Route Handler to mutate data, when they can call Server Actions directly. — [Vercel blog: Common mistakes with the App Router](https://vercel.com/blog/common-mistakes-with-the-next-js-app-router-and-how-to-fix-them)
- Related guide (not fetched): [The Server and Client Boundary](https://nextjs.org/docs/app/guides/server-and-client-boundary), linked from the page above as the deeper explanation.

### Inferences
- Lint and review rules a skill can encode: a `'use client'` file should not import a `server-only` module; layouts and pages should stay Server Components unless there is a strong reason; client props should be narrow DTOs, not whole entities (see §3).

### Gaps
- The "Server and Client Boundary" guide was not fetched. Its specific rules are not captured here.

---

## 3. Data access: DAL, DTOs, `server-only`, and where fetching lives

### Takeaway
Next.js recommends picking **one** of three data models: external HTTP APIs (existing orgs and separate backends), a Data Access Layer (new full-stack projects), or component-level access (prototypes only). Reads happen in Server Components. Writes go through Server Actions. Route Handlers are an escape hatch, not the way Server Components get data.

### Cited Findings
- **Sources:** https://nextjs.org/blog/security-nextjs-server-components-actions (Sebastian Markbåge, 2023-10-23; the original essay, some APIs dated, e.g. sync `cookies()`), and https://nextjs.org/docs/app/guides/data-security (lastUpdated 2026-11-18; the current, maintained version). Answers: how to choose a data model and how to avoid leaking data across the boundary.
- **Three approaches:** "HTTP APIs: for existing large applications and organizations", "Data Access Layer: for new projects", "Component-Level Data Access: for prototypes and learning". "We recommend choosing one data fetching approach and avoiding mixing them." — [Data Security guide](https://nextjs.org/docs/app/guides/data-security); the blog adds "Exceptions pop out as suspicious." — [Security blog](https://nextjs.org/blog/security-nextjs-server-components-actions)
- **External HTTP APIs** (the DevDigest case): follow "a **Zero Trust** model." Call REST or GraphQL from Server Components with `fetch` "just as you would in Client Components," passing cookies along. This fits when "Separate backend teams use other languages or manage APIs independently." — [Data Security guide](https://nextjs.org/docs/app/guides/data-security). The blog says to treat Server Components "as unsafe/untrusted by default like SSR or within the client," so "there is no assumption of an internal network or zones of trust." — [Security blog](https://nextjs.org/blog/security-nextjs-server-components-actions)
- **DAL** should "Only run on the server", "Perform authorization checks", and "Return safe, minimal **Data Transfer Objects (DTOs)**". `getCurrentUser` is wrapped in React `cache()`, and DTO modules start with `import 'server-only'`. "Only the Data Access Layer should access `process.env`." — [Data Security guide](https://nextjs.org/docs/app/guides/data-security)
- DTO idea: DAL methods "should expose objects that are safe to be transferred to the client as is", which keeps security audits focused on the DAL "while the UI can rapidly iterate." — [Security blog](https://nextjs.org/blog/security-nextjs-server-components-actions)
- **Client props:** "A Client Component should not accept more data than the minimal data it needs to perform its job." Flag overly broad props like `user: User`. — [Security blog](https://nextjs.org/blog/security-nextjs-server-components-actions)
- **Taint APIs** (`experimental.taint`) are an extra safety layer, not a replacement for DAL filtering. — [Data Security guide](https://nextjs.org/docs/app/guides/data-security)
- **Inputs are untrusted:** `searchParams`, `params` and headers must be re-verified. "Always re-read access control and `cookies()` whenever reading data. Don't pass it as props or params." Rendering must not mutate anything. — [Security blog](https://nextjs.org/blog/security-nextjs-server-components-actions); [Data Security guide](https://nextjs.org/docs/app/guides/data-security)
- **Audit checklist:** the DAL is isolated (DB packages and env vars not imported outside it); `"use client"` props are not overly broad; `"use server"` args are validated and re-authorized, ownership is checked, return values are filtered, and DB access is delegated to a `server-only` DAL; `[param]` folders are validated; `proxy.ts`/`route.ts` get extra scrutiny. — [Data Security guide](https://nextjs.org/docs/app/guides/data-security)
- **Where fetching lives:** "Fetch data in Server Components directly from its source, not via Route Handlers." For prerendered pages this "will fail the build step", and on demand it costs an extra HTTP round trip. Client-side fetching (SWR, TanStack Query) is for data that depends on client-only Web APIs or "Frequently polled data." — [Backend for Frontend guide](https://nextjs.org/docs/app/guides/backend-for-frontend)

### Inferences
- For DevDigest (Fastify on :3001 owns the DB), the "External HTTP APIs" model applies, and a Next.js-side DAL over Postgres would be mixing models. The Next.js server layer should then be a thin, typed **API client** (`server-only` where it uses secrets or cookies), plus DTO mapping and Zod parsing of responses. That last part is an inference, not a Next.js statement; it is consistent with the DTO and zero-trust advice.

### Gaps
- No official Next.js page gives a canonical folder layout for an API-client module that talks to a separate backend. The docs show only inline `fetch` examples.

---

## 4. Server Actions / Server Functions: placement, validation, not for fetching

### Takeaway
Define actions in a dedicated `'use server'` file (required when Client Components use them), or inline in Server Components. Treat every action as a public POST endpoint: authenticate, authorize, validate args (e.g. with Zod), and return minimal data. Keep actions thin by delegating to a `server-only` data layer. Do not use them for data fetching, because they are dispatched sequentially.

### Cited Findings
- **Source:** https://nextjs.org/docs/app/getting-started/mutating-data (lastUpdated 2026-10-15; replaces the older "updating-data" URL, which now returns 404). Answers: how to create and invoke actions.
- `'use server'` can go at the top of an async function or "at the top of a separate file to mark all exports of that file." — [Mutating Data](https://nextjs.org/docs/app/getting-started/mutating-data)
- "It's not possible to define Server Functions in Client Components. However, you can invoke them in Client Components by importing them from a file that has the `"use server"` directive at the top." Actions can also be passed as props. — [Mutating Data](https://nextjs.org/docs/app/getting-started/mutating-data)
- "Server Functions are reachable via direct POST requests, not just through your application's UI. Always verify authentication and authorization inside every Server Function." — [Mutating Data](https://nextjs.org/docs/app/getting-started/mutating-data)
- "Server Functions are designed for server-side mutations. The client dispatches and awaits them one at a time." For parallel fetching, use Server Components or a Route Handler. — [Mutating Data](https://nextjs.org/docs/app/getting-started/mutating-data). Also: "Server Actions are queued. Using them for data fetching introduces sequential execution." — [Backend for Frontend guide](https://nextjs.org/docs/app/guides/backend-for-frontend)
- Pending UI uses `useActionState`. After a mutation, call `revalidatePath`/`revalidateTag`/`refresh()` (16), and call `redirect()` last, because it throws. — [Mutating Data](https://nextjs.org/docs/app/getting-started/mutating-data)
- **Validation:** "Functions should also validate the integrity of each argument. This can be done manually or with a tool like `zod`." The argument list "must always be treated as hostile." `.bind()` arguments are NOT encrypted, while closure variables are. — [Security blog](https://nextjs.org/blog/security-nextjs-server-components-actions)
- **Thin actions plus a DAL for mutations:** keep auth, authz and DB logic in a `server-only` module, so the `"use server"` action only delegates and revalidates. `import 'server-only'` works in both files. Return `{ success: true }`, not raw records. A page-level auth check "does not extend to the Server Actions defined within it." — [Data Security guide](https://nextjs.org/docs/app/guides/data-security)
- **Reference placement (Vercel Commerce):** the cart's actions live in `components/cart/actions.ts` (`"use server"`), next to the cart UI. The Shopify data layer is in `lib/shopify/{index.ts, queries/, mutations/, fragments/, types.ts}`, and `app/` holds routes only, plus one `app/api/revalidate/route.ts` webhook. The repo is on `next 15.6.0-canary.60`. — [vercel/commerce repo](https://github.com/vercel/commerce) (tree checked through the GitHub API)

### Inferences
- In DevDigest, with a separate Fastify API, a Server Action is an optional BFF hop: action → Fastify. That only pays off if you want progressive-enhancement forms or `revalidatePath`. Calling Fastify directly from client mutations (TanStack Query) stays valid. This is an inference; no source addresses it directly.

### Gaps
- No official source prescribes a feature-folder naming convention for actions such as `features/x/actions.ts`. Commerce colocates by UI component and the docs use `app/actions.ts` or `app/lib/actions.ts`.

---

## 5. Route Handlers vs a separate backend; structuring the API client

### Takeaway
Route Handlers are public endpoints for a "Backend for Frontend" layer: webhooks, non-UI content, and proxying with auth. The docs say they are "not a full backend replacement." With a separate backend, use `rewrites` for plain forwarding, and a Route Handler only when you must validate, inject a server-side credential, or transform the response. Server Components should call the backend (or your API client) directly, never your own Route Handlers.

### Cited Findings
- **Source:** https://nextjs.org/docs/app/guides/backend-for-frontend (lastUpdated 2026-11-06). Answers: BFF use, proxying to a backend, and caveats.
- "Next.js backend capabilities are not a full backend replacement." They are an API layer that "is publicly reachable", "handles any HTTP request", and "can return any content type." — [BFF guide](https://nextjs.org/docs/app/guides/backend-for-frontend)
- **Proxying:** "To forward requests to another backend, use `rewrites` in `next.config.js` or a `proxy` rewrite. When you need to validate requests, authenticate with the backend, or transform its response, use a Route Handler." — [BFF guide](https://nextjs.org/docs/app/guides/backend-for-frontend)
- **Header hygiene:** "Send the backend only the headers and credentials it needs." The example uses a fixed `ENDPOINTS` allow-list map, so "a caller cannot point the request, or its token, at another destination", plus `redirect: 'error'`. For streaming or large payloads, "use rewrites instead." — [BFF guide](https://nextjs.org/docs/app/guides/backend-for-frontend)
- "Do not rely on proxy alone for authentication and authorization." Responses cached by a CDN skip handler checks. — [BFF guide](https://nextjs.org/docs/app/guides/backend-for-frontend)
- Route Handlers deployed as lambdas cannot share data between requests, and WebSockets will not work. — [BFF guide](https://nextjs.org/docs/app/guides/backend-for-frontend)
- Route Handlers and middleware/proxy are "low level escape hatches" that need extra auditing, including manual CSRF protection. — [Security blog](https://nextjs.org/blog/security-nextjs-server-components-actions)
- **Reference API-client structure for a separate backend (Bulletproof React, `apps/nextjs-app`):** `src/lib/api-client.ts` is one `fetchApi` wrapper that forwards server cookies via a dynamic `import('next/headers')` when it runs on the server. `src/lib/react-query.ts` holds the shared query config. Each feature has `src/features/<feature>/api/<verb-noun>.ts`, each exporting a fetcher, `...QueryOptions` (`queryOptions`) and a `use...` hook. Pages (`src/app/app/discussions/page.tsx`) prefetch with `queryClient.prefetchQuery(getXQueryOptions())` and render `<HydrationBoundary state={dehydrate(queryClient)}>` around a route-local `_components/` client component. Caveat: that app is on `next ^14.2.5`, uses sync `searchParams`, and was last touched 2026-04-30. — [bulletproof-react repo, apps/nextjs-app](https://github.com/alan2207/bulletproof-react/tree/master/apps/nextjs-app) (files read through the GitHub API)

### Inferences
- For DevDigest the closest-fitting reference is the Bulletproof `nextjs-app` pattern: a separate REST API, TanStack Query, per-feature `api/` files, and SSR prefetch with `HydrationBoundary`. It needs updating to async `params`/`searchParams`, and the shared client should split into a `server-only` server fetch (cookies, secrets) and a browser fetch, instead of the runtime `typeof window` check. The split is an inference from the `server-only` guidance in §2–3.
- Adding Route Handlers that just mirror Fastify routes would add a hop with no benefit. `rewrites` covers same-origin needs such as cookies or CORS.

### Gaps
- No official Vercel/Next.js page compares "SSR prefetch + TanStack Query hydration" against "Server Component fetch + props" for a separate backend. TanStack's own "Advanced SSR" docs would cover it but were not fetched.

---

## 6. Reference architectures

### Takeaway
The reference repos fall into three styles: route-first with `components/` and `lib/` at the root (Vercel Commerce), feature-modules with one-way imports (Bulletproof React), and a monorepo of independently deployable apps plus single-purpose packages (next-forge). FSD can be layered on Next.js by renaming its `app`/`pages` layers and re-exporting from `app/`.

### Cited Findings
- **Vercel Commerce** (https://github.com/vercel/commerce): root has `app/` (routes, `[page]`, `product/[handle]`, `search/[collection]` with its own `layout.tsx`/`loading.tsx`, `api/revalidate`), `components/<domain>/` (cart, grid, layout, product; actions colocated), and `lib/<provider>/` (queries, mutations, fragments, types). This is strategy "files outside of app." — [vercel/commerce](https://github.com/vercel/commerce)
- **Bulletproof React** (https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md): `src/{app, assets, components, config, features, hooks, lib, stores, testing, types, utils}`, with "most code" in `features/<name>/{api, assets, components, hooks, stores, types, utils}`, using only the subfolders you need. Rules: no cross-feature imports ("compose different features at the application level"); one-way flow shared → features → app, enforced with ESLint `import/no-restricted-paths`; avoid barrel files (tree-shaking). — [Bulletproof React project-structure doc](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- **Bulletproof `apps/nextjs-app`**: `src/app/` holds routes plus route-local `_components/` and `__tests__/`, `app/provider.tsx`, and route areas `app/`, `auth/`, `public/` as plain folders (not route groups). Shared code is in `src/components/{ui,layouts,errors}`, `src/config/{env,paths}.ts`, `src/lib/{api-client,auth,authorization,react-query}`, and `src/features/<f>/{api,components}`. — [bulletproof-react apps/nextjs-app](https://github.com/alan2207/bulletproof-react/tree/master/apps/nextjs-app)
- **Feature-Sliced Design + Next.js** (https://feature-sliced.design/docs/guides/tech/with-nextjs): put Next.js `app/` (and `pages/`) at the project root, with FSD in `src/`. Rename FSD's `app`/`pages` layers to `_app`/`_pages` to avoid conflicts (works with the Steiger linter). Next.js `app/.../page.tsx` only re-exports from `@/_pages/...`. Route Handler logic goes in the `api-routes` segment of `_app`, re-exported from `app/api/.../route.ts`. `middleware`/`instrumentation` stay at the root. DB queries go in `shared/db`. Add `index.server.ts` per slice for server-only exports. FSD is "primarily intended for frontends," so a heavy backend should be a separate package. Server Actions are not covered. — [FSD with Next.js](https://feature-sliced.design/docs/guides/tech/with-nextjs)
- **next-forge** (https://www.next-forge.com/docs/structure; repo https://github.com/vercel/next-forge): a Turborepo monorepo. `apps/` = `api, app, docs, email, storybook, studio, web` (from the repo tree); `packages/` = `ai, analytics, auth, cms, database, design-system, email, feature-flags, internationalization, next-config, observability, payments, rate-limit, security, seo, storage, webhooks, …`. Rules: each app is "a self-contained application that can be deployed independently"; apps do not depend on each other; packages do not depend on each other; each app has an `env.ts` composing its packages' env. Isolation makes implementations swappable, e.g. `database` holds the schema and migrations. — [next-forge structure docs](https://www.next-forge.com/docs/structure); [vercel/next-forge](https://github.com/vercel/next-forge)

### Inferences
- DevDigest already separates packages without a workspace (client / server / reviewer-core). Inside `client/`, the Bulletproof feature-module rules (one-way imports, no cross-feature imports, ESLint-enforced) are the most portable recommendation. FSD is heavier and needs layer renames.

### Gaps
- **shadcn `taxonomy`**: not researched. It is an older Next.js 13 beta-era demo, and its relevance in 2026 is doubtful.
- **Lee Robinson posts beyond the Vercel "common mistakes" article**: searched; no architecture or DAL post by him turned up (search results were third-party blogs, not used).
- **Next.js official `examples/` directory**: not reviewed.

---

## 7. i18n (next-intl): placement of messages and config (architectural only)

### Takeaway
next-intl keeps `messages/<locale>.json` at the project root and config in `src/i18n/` (`request.ts`, plus `routing.ts` and `navigation.ts` when you use locale routing). Server Components use `getTranslations`/`useTranslations`, and Client Components get translations through a `NextIntlClientProvider` in the layout. Namespaces map to top-level keys in the messages JSON.

### Cited Findings
- **Without locale routing:** `messages/en.json` at the root; `src/i18n/request.ts` with `getRequestConfig` returning `locale` and `messages` (found automatically in `src/` or the root); `next.config.ts` wraps the config with `createNextIntlPlugin()`; the root layout wraps children in `NextIntlClientProvider`. The locale can come from a cookie or user preference. — [next-intl App Router setup](https://next-intl.dev/docs/getting-started/app-router)
- **Namespaces:** `useTranslations('HomePage')` scopes lookups to the `HomePage` object in `en.json`. Async server components use `getTranslations` from `next-intl/server`. — [next-intl App Router setup](https://next-intl.dev/docs/getting-started/app-router)
- **With locale routing:** `src/i18n/{routing.ts, navigation.ts, request.ts}`, `src/proxy.ts` (the next-intl middleware, with a matcher that skips `/api`, `/_next`, dotted paths), and `src/app/[locale]/{layout,page}.tsx`. "proxy.ts was called middleware.ts up until Next.js 16." `request.ts` reads the locale from `next/root-params`, "available by default in Next.js 16.3 and later"; `setRequestLocale` is legacy. — [next-intl routing setup](https://next-intl.dev/docs/routing/setup)

### Inferences
- These docs describe next-intl v4 on Next.js 16. DevDigest is on next-intl ^3.26 and Next 15, so its equivalents are `middleware.ts` and no `root-params`. A skill should pin guidance to the installed versions.

### Gaps
- next-intl's docs pages fetched give no official recommendation on splitting namespaces by feature or component, or on splitting message files per feature.

---

## Quick source index (URL → question it answers)

| URL | Answers |
|---|---|
| https://nextjs.org/docs/app/getting-started/project-structure | Colocation, `_private`, `(groups)`, `src/`, the 3 official org strategies |
| https://nextjs.org/docs/app/getting-started/server-and-client-components | `'use client'` boundary at the leaves, interleaving via `children`, providers deep, `server-only`/`client-only` |
| https://react.dev/reference/rsc/use-client | Directive semantics: module boundary, transitive imports, serializable props |
| https://nextjs.org/docs/app/guides/data-security | Choosing one data model (HTTP API / DAL / component), DAL + DTO, action auth/authz/validation, audit checklist |
| https://nextjs.org/blog/security-nextjs-server-components-actions | Original rationale (Markbåge, 2023): zero trust for external APIs, DTOs, Zod validation of action args |
| https://nextjs.org/docs/app/getting-started/mutating-data | Where to define Server Functions, invoking from client, not for fetching (sequential) |
| https://nextjs.org/docs/app/guides/backend-for-frontend | Route Handlers as BFF, proxying a separate backend (rewrites vs handler), don't fetch own handlers from RSC |
| https://vercel.com/blog/common-mistakes-with-the-next-js-app-router-and-how-to-fix-them | Lee Robinson's anti-pattern list (2024) |
| https://nextjs.org/blog/next-16 | What changed after 15: `proxy.ts`, async-only APIs, `updateTag`/`refresh` |
| https://github.com/vercel/commerce | Reference layout: routes in `app/`, domain `components/`, provider `lib/`, colocated `actions.ts` |
| https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md | Feature modules, one-way imports, no cross-feature imports, no barrels |
| https://github.com/alan2207/bulletproof-react/tree/master/apps/nextjs-app | App Router + separate REST API + TanStack Query prefetch/HydrationBoundary (Next 14) |
| https://feature-sliced.design/docs/guides/tech/with-nextjs | FSD on Next.js: `_app`/`_pages` renames, re-export pages, `index.server.ts` |
| https://www.next-forge.com/docs/structure | Monorepo apps/packages, independence rules |
| https://next-intl.dev/docs/getting-started/app-router | messages/ + i18n/request.ts, provider, namespaces |
| https://next-intl.dev/docs/routing/setup | Locale routing layout (`i18n/routing.ts`, `[locale]`, `proxy.ts`) |
