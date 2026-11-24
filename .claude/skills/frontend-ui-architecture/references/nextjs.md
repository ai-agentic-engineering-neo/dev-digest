# Next.js App Router — rules for this project

Installed: `next ^15.5`, `react ^19`, `next-intl ^3.26`. Source IDs resolve in `../README.md`.

## Data model: External HTTP API

Next.js names three data-access models and asks you to pick one and not mix them: HTTP APIs
(existing backend), a Data Access Layer (new full-stack app), component-level access
(prototypes) [S15, S16]. DevDigest is the first: Fastify on :3001 owns Postgres, secrets and
LLM calls. Consequences:

- No DAL, no `server-only` DB modules, no secrets in the client package.
- No Route Handlers (`app/api/**/route.ts`) that mirror Fastify routes. If proxying is ever
  needed, use `rewrites` in `next.config.mjs`; a Route Handler only when it must validate,
  inject server credentials or transform, with an endpoint allow-list. Streaming (SSE) must go
  direct or via rewrites, not a handler [S18].
- Server Components must not fetch the app's own Route Handlers [S18, S67].
- No Server Actions for reading data (they run sequentially) [S17]. A Server Action here would
  add a hop (action → Fastify); use one only for a form that needs progressive enhancement, and
  treat it as a public POST: validate args with Zod, authorize, return minimal data [S17, S15].
- Mutations from the browser go through TanStack Query mutations in `lib/hooks` straight to
  Fastify. (No source forbids it; it follows from the chosen model.)

## The client boundary

- `"use client"` marks the module and its **transitive imports** as client code [S10].
- Put it on files that need state, effects, event handlers or browser APIs. Keep it off
  `constants.ts`, `helpers.ts`, `types.ts`, `styles.ts` and `lib/<topic>.ts` pure modules so
  they stay usable from Server Components too [S13].
- Props crossing a server → client boundary must be serializable (no functions, class
  instances); JSX and Promises are fine [S10].
- Server Components can be passed into Client Components as `children` (interleaving) [S13].
- Context providers live in their own `"use client"` file, rendered as deep as possible;
  `lib/providers.tsx` is the root composition point [S13].
- Third-party client-only components without a directive are re-exported from a small
  `"use client"` wrapper file [S13].
- If a module must never reach the browser, add `import "server-only"` [S13].

## Current state vs direction

Today most route views are client components that fetch through TanStack Query. That is valid
under the chosen model. Moving a route to Server-Component data fetching (or SSR prefetch +
`HydrationBoundary`, as in Bulletproof's `apps/nextjs-app` [S33]) is an open question for an
ADR — no official doc compares the two for a separate backend. Until decided:
- `page.tsx` stays thin: read params, render the route's view component.
- Don't add `"use client"` to a `page.tsx` that only renders a client view — the view already
  carries the directive. (Legacy pages that do it are fine to leave.)

## Route organization tools [S12]

- Only `page`/`route` files make a segment public; other files in `app/` are safe to colocate.
- `_folder` excludes a folder and its subtree from routing → `_components`.
- `(group)` groups routes without changing URLs; allows a per-group layout. Use when a set of
  routes shares a layout distinct from the root.
- Folder names `components`/`lib` mean nothing to Next.

## Version traps (docs are ahead of the project)

| In live docs | Status here |
|---|---|
| `proxy.ts` (renamed `middleware.ts`) | Next 16 only — use `middleware.ts` [S21] |
| `refresh()`, `updateTag()` | Next 16 only [S21] |
| Sync `params`/`cookies()` removed | Next 15 already async — always `await params` in server files [S21] |
| next-intl `proxy.ts`, `next/root-params`, v4 routing | next-intl v3 here: `src/i18n/request.ts`, `messages/en/*.json`, `NextIntlClientProvider` in layout, `getTranslations` in Server Components [S22, S23] |
| Bulletproof `apps/nextjs-app` | Next 14 with sync `searchParams` — port before copying [S33] |

## i18n placement

Messages are split by namespace file (`messages/en/prReview.json`, `agents.json`, …); a route's
components use the route's namespace, `common` for shared words. next-intl gives no official
guidance on per-feature splitting — this file-per-namespace layout is the local decision [S22].
