# 0004 — Pages stay client-rendered; no SSR prefetch

Status: Accepted · 2026-11-25 · plan item C10

## Context
DevDigest is a local-first studio: the Next.js app (:3000) talks to the Fastify
API (:3001) on the same machine, and every page fetches through TanStack Query
hooks in `lib/hooks` (with polling and SSE for live runs). Next 15 also allows
server-side prefetch with `HydrationBoundary`. That would add a server-side data
path (API base URL from the Next server, auth/host checks — the API rejects
unexpected Host/Origin), duplicate fetch logic, and hydration edge cases, for a
latency win that is small on localhost.

## Decision
Keep pages client-rendered with TanStack Query; no SSR prefetch and no data
fetching in Server Components for now.

## Consequences
- One data path (hooks + `queryOptions` factories) and one cache.
- First paint shows skeletons briefly; acceptable for a local tool.
- The `queryOptions` factories (plan C6) keep the door open: a prefetch can reuse
  them unchanged.

## Revisit when
- the app is deployed remotely (latency matters), or
- a page needs SEO/shareable server-rendered content, or
- first-load time on a large repo becomes a measured complaint.
