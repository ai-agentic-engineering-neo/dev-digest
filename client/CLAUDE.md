# client/ — @devdigest/web

Next.js 15 studio (App Router), React 19. Port 3000. Repo-wide rules:
[../CLAUDE.md](../CLAUDE.md).

## Stack

Next.js 15 (App Router) · React 19 · TanStack Query · `next-intl` · `recharts`
· `mermaid` · `react-markdown`. UI primitives vendored under `src/vendor/ui`
(`@devdigest/ui`); shared contracts vendored under `src/vendor/shared`.

## Commands

`pnpm dev` (:3000) · `pnpm test` (vitest + jsdom, `fetch` mocked) ·
`pnpm typecheck`

## Where things live

- `src/app/**/page.tsx` — routes (App Router)
- `src/lib/hooks/*` — one TanStack Query hook file per API domain
- `src/lib/api.ts` — the only place that knows `NEXT_PUBLIC_API_BASE`
- `<route>/_components/<Name>/` — colocated feature components + `*.test.tsx`

## Non-default conventions

- `src/vendor/shared` is a **hand-copied, trimmed subset** of the server's
  `@devdigest/shared` — it can lag behind on purpose (unused-yet contracts) or
  by accident (drift, see `INSIGHTS.md`). Check the server's copy before
  assuming a type is missing rather than just absent here.
- Tests mock `fetch` — no API, DB, or browser needed; don't reach for a real
  request or MSW.
- The PR detail route is keyed by PR **number** in the URL, but every PR API
  call needs the row's **uuid** — resolved via the (cached) pulls list, not a
  direct lookup by number.

## Session protocol

- Before work: skim [INSIGHTS.md](INSIGHTS.md); name the top relevant points.
- After a non-trivial task: run the `engineering-insights` skill.

## Docs map

- [README.md](README.md) — UI route map, testing notes
- [INSIGHTS.md](INSIGHTS.md) — dev log: decisions/gotchas found while working here
