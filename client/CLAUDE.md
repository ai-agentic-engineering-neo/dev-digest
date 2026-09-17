# `client/` — @devdigest/web

Next.js studio UI: import repos, browse PRs, run/read reviews, author agents.
Full docs: [`README.md`](README.md). Deeper notes: [`docs/`](docs/) ·
[`specs/`](specs/) · [`INSIGHTS.md`](INSIGHTS.md).

## Stack

Node ≥22 · pnpm ≥10 · Next.js 15 (App Router) · React 19 · TanStack Query
5.62 · `next-intl` 3.26 · `recharts` 2.15 · `mermaid` 11.15 · `react-markdown`
9 + `remark-gfm` 4 · Tailwind 4 · `zod` 3.24 · `vitest` 2.1 + jsdom + Testing
Library 16.

## Commands

```
pnpm dev          # web on :3000
pnpm build
pnpm typecheck
pnpm test         # vitest + jsdom, fetch mocked — no API needed
```

## Map

- `src/app/**` — App Router routes (`repos`, `agents`, `settings`,
  `onboarding`); pages are thin
- `src/components/` — cross-cutting chrome: `app-shell` (nav, breadcrumbs,
  `g`-then-key shortcuts), `diff-viewer`, `mermaid-diagram`, `page-shell`,
  `showcase`
- `src/lib/hooks/*` — one hook per API call, backed by `src/lib/api.ts`
- `src/i18n/` — `next-intl` setup; messages in `messages/<locale>/*.json`
- `src/vendor/ui/` — `@devdigest/ui` primitives, vendored in
- `src/vendor/shared/` — `@devdigest/shared` (Zod contracts), vendored in

## Conventions & gotchas (non-default, not guessable from the code)

- Feature logic sits in colocated `_components/<Name>/` folders beside each
  page (each with its own `*.test.tsx`) — not in a global components tree.
- API base is `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`). Every
  server call goes through a `src/lib/hooks/*` hook — never a raw `fetch` in
  a component.
- `*.test.tsx` mock `fetch`; no real API or browser involved. Real browser
  journeys are covered by [`../e2e`](../e2e/CLAUDE.md), not here.
- `src/vendor/ui` and `src/vendor/shared` are vendored **copies**, not live
  package links — an upstream change doesn't propagate automatically.

## Do not touch

- Nothing package-specific beyond treating `src/vendor/*` as copies, not
  symlinks — edit with that in mind.
